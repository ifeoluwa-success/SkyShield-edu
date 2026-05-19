from datetime import datetime, timezone

from .models import IncidentRun, MissionParticipant, IncidentEvent, ThreatNode, Scenario
from apps.analytics.models import UserPerformance, SkillAssessment, PerformanceTrend
from apps.simulations.models import UserDecision, SimulationSession

from .state_machine import PHASE_TIME_LIMITS


class SimulationEngine:
    """
    Core mission engine that processes actions, evaluates correctness,
    triggers escalations, and computes final scores for an IncidentRun.
    """

    @staticmethod
    def participant_may_advance_mission(run, user):
        """
        When scenario.requires_team_participation is True, only the lead
        operator's actions advance the mission step cursor. Otherwise any
        participant may advance (solo-friendly).
        """
        if user is None:
            return True
        if not getattr(run.scenario, 'requires_team_participation', False):
            return True
        p = MissionParticipant.objects.filter(run=run, user=user).first()
        return p is not None and p.role == 'lead_operator'

    @staticmethod
    def _choice_id_set(value):
        """
        Normalize a submitted decision or a stored 'correct' value into a set of
        comparable string ids (handles plain strings vs {id: ...} UI payloads).
        """
        out = set()
        if value is None:
            return out
        if isinstance(value, str):
            out.add(value)
            return out
        if isinstance(value, (int, float, bool)):
            out.add(str(value))
            return out
        if isinstance(value, dict):
            for key in ('id', 'choice_id', 'option_id', 'value', 'answer', 'selected'):
                v = value.get(key)
                if v is None or v == '':
                    continue
                if isinstance(v, list):
                    for x in v:
                        out.update(SimulationEngine._choice_id_set(x))
                elif isinstance(v, dict):
                    out.update(SimulationEngine._choice_id_set(v))
                else:
                    out.add(str(v))
            return out or {str(value)}
        if isinstance(value, list):
            for item in value:
                out.update(SimulationEngine._choice_id_set(item))
            return out
        out.add(str(value))
        return out

    @staticmethod
    def _decision_matches_correct(correct_action, decision_data):
        expected = SimulationEngine._choice_id_set(correct_action)
        actual = SimulationEngine._choice_id_set(decision_data)
        if expected and actual:
            return bool(expected & actual)
        return decision_data == correct_action

    def apply_action(self, run, action_data):
        """
        Core decision processing method.
        run: IncidentRun instance
        action_data: dict with keys action_type, step_id, decision_data,
                     timestamp_client (optional)

        Steps:
        1. Record server-side timestamp
        2. Compute decision_latency_ms:
             if run.phase_started_at exists:
               latency = (now - run.phase_started_at).total_seconds() * 1000
             else:
               latency = 0
        3. Call self.evaluate_decision(run.scenario, action_data)
        4. If not is_correct: call self.check_escalation(run)
        5. Compute score delta using this formula:
             step = get current step from run.session_state
             base_points = step.get('points_value', 10)
             time_limit_ms = PHASE_TIME_LIMITS[run.phase] * 1000
             speed_ratio = latency / time_limit_ms
             speed_bonus = max(0, base_points * 0.3 * (1 - speed_ratio))
             deduction = base_points * 0.5 if not is_correct else 0
             delta = base_points + speed_bonus - deduction
        6. Update run.session_state:
             current_score += delta
             current_step advances to next step
             record decision in session_state['decisions']
        7. Create UserDecision record (existing model):
             session = get or create SimulationSession linked to run
             step_number = current step index (not graph step_id strings)
             decision_type = action_data['action_type']
             decision_data = action_data['decision_data']
             is_correct = is_correct
             time_taken = latency / 1000
        8. Create IncidentEvent(
             run=run,
             event_type='action_submitted',
             actor=user,
             payload={
               action_type, step_id, is_correct,
               latency_ms, score_delta: delta,
               consequences
             }
           )
        9. Save run
        10. Return the IncidentEvent
        """
        now = datetime.now(timezone.utc)
        if run.phase_started_at:
            latency_ms = (now - run.phase_started_at).total_seconds() * 1000
        else:
            latency_ms = 0

        session_state = run.session_state or {}
        current_step_idx = int(session_state.get('current_step', 0) or 0)
        steps = run.scenario.steps or []

        raw_step_id = action_data.get('step_id')
        if isinstance(raw_step_id, str) and raw_step_id.lower() == 'current':
            resolved = None
            if current_step_idx < len(steps) and isinstance(steps[current_step_idx], dict):
                row = steps[current_step_idx]
                resolved = row.get('id') or row.get('step_id')
            if resolved is None:
                graph = getattr(run.scenario, 'graph', None) or {}
                if isinstance(graph, dict) and graph:
                    nodes = graph.get('nodes') or graph.get('steps') or []
                    if isinstance(nodes, dict):
                        nodes = list(nodes.values())
                    if (
                        isinstance(nodes, list)
                        and current_step_idx < len(nodes)
                        and isinstance(nodes[current_step_idx], dict)
                    ):
                        node = nodes[current_step_idx]
                        resolved = node.get('id') or node.get('step_id')
            if resolved is not None:
                action_data['step_id'] = resolved

        is_correct, consequences, next_state = self.evaluate_decision(run.scenario, action_data)

        user = action_data.get('user')

        escalation_payload = None
        if not is_correct:
            escalation_payload = self.check_escalation(run)

        step = steps[current_step_idx] if current_step_idx < len(steps) else {}

        base_points = step.get('points_value', 10)
        time_limit_ms = (PHASE_TIME_LIMITS.get(run.phase) or 0) * 1000
        if time_limit_ms > 0:
            speed_ratio = latency_ms / time_limit_ms
        else:
            speed_ratio = 1
        speed_bonus = max(0, base_points * 0.3 * (1 - speed_ratio))
        deduction = base_points * 0.5 if not is_correct else 0
        delta = base_points + speed_bonus - deduction

        current_score = float(session_state.get('current_score', 0) or 0)
        session_state['current_score'] = current_score + float(delta)
        may_advance = self.participant_may_advance_mission(run, user)
        if may_advance and is_correct:
            session_state['current_step'] = current_step_idx + 1
        else:
            session_state['current_step'] = current_step_idx

        decisions = session_state.get('decisions') or []
        if not isinstance(decisions, list):
            decisions = []
        decisions.append({
            'action_type': action_data.get('action_type'),
            'step_id': action_data.get('step_id'),
            'decision_data': action_data.get('decision_data'),
            'timestamp_server': now.isoformat(),
            'is_correct': is_correct,
            'latency_ms': latency_ms,
            'score_delta': float(delta),
            'consequences': consequences,
            'next_state': next_state,
            'escalation': escalation_payload,
            'phase': run.phase,
        })
        session_state['decisions'] = decisions
        run.session_state = session_state

        sim_session = None
        if user is not None:
            sim_session, _ = SimulationSession.objects.get_or_create(
                user=user,
                scenario=run.scenario,
                attempt_number=1,
                defaults={'status': 'in_progress'},
            )

            UserDecision.objects.create(
                session=sim_session,
                step_number=current_step_idx,
                decision_type=action_data.get('action_type'),
                decision_data=action_data.get('decision_data'),
                is_correct=is_correct,
                time_taken=int(latency_ms / 1000) if latency_ms else 0,
                feedback='',
            )

        event = IncidentEvent.objects.create(
            run=run,
            event_type='action_submitted',
            actor=user,
            payload={
                'action_type': action_data.get('action_type'),
                'step_id': action_data.get('step_id'),
                'is_correct': is_correct,
                'latency_ms': latency_ms,
                'score_delta': float(delta),
                'consequences': consequences,
                'next_state': next_state,
                'escalation': escalation_payload,
            }
        )
        run.save()
        return event

    def evaluate_decision(self, scenario, action_data):
        """
        Check action against scenario's correct actions.
        If scenario.graph is populated (not empty dict), use graph-based check.
        Otherwise fall back to correct_actions list check.

        Graph-based: find node matching action_data['step_id'],
                     check if action_data['decision_data'] matches node's
                     correct_action field (see _decision_matches_correct).
        List-based:  true if decision matches any entry in scenario.correct_actions
                     using the same normalization (string id vs {id: ...} object).

        Returns (is_correct: bool, consequences: list, next_state: dict)
        """
        step_id = action_data.get('step_id')
        decision_data = action_data.get('decision_data')

        consequences = []
        next_state = {}

        graph = getattr(scenario, 'graph', None) or {}
        if isinstance(graph, dict) and graph:
            nodes = graph.get('nodes') or graph.get('steps') or []
            if isinstance(nodes, dict):
                nodes = list(nodes.values())

            matched = None
            for node in nodes:
                if not isinstance(node, dict):
                    continue
                if node.get('id') == step_id or node.get('step_id') == step_id:
                    matched = node
                    break

            if matched is None:
                return (False, [{'reason': 'step_not_found_in_graph'}], {})

            correct_action = matched.get('correct_action')
            is_correct = self._decision_matches_correct(correct_action, decision_data)
            consequences = matched.get('consequences') or []
            next_state = matched.get('next_state') or {}
            return (is_correct, consequences, next_state)

        correct_actions = scenario.correct_actions or []
        is_correct = any(
            self._decision_matches_correct(ca, decision_data) for ca in correct_actions
        )
        return (is_correct, consequences, next_state)

    def check_escalation(self, run):
        """
        Check if a wrong or slow action should trigger an escalation.

        1. Load scenario.escalation_rules (list of rule dicts)
        2. Each rule has: trigger (wrong_action|timeout), phase, consequence
        3. If a matching rule is found:
             - Create ThreatNode linked to this scenario
             - Create IncidentEvent(event_type='escalation_triggered',
                 payload={rule, new_threat_label, severity})
             - Add threat to run.session_state['active_threats']
        4. Return escalation_payload dict or None if no escalation
        """
        rules = getattr(run.scenario, 'escalation_rules', None) or []
        if not isinstance(rules, list):
            return None

        matched = None
        for rule in rules:
            if not isinstance(rule, dict):
                continue
            if rule.get('trigger') != 'wrong_action':
                continue
            if rule.get('phase') != run.phase:
                continue
            matched = rule
            break

        if matched is None:
            return None

        consequence = matched.get('consequence') or {}
        if not isinstance(consequence, dict):
            consequence = {'detail': consequence}

        label = consequence.get('label') or consequence.get('threat_label') or 'Escalated Threat'
        severity = int(consequence.get('severity', 3) or 3)

        threat = ThreatNode.objects.create(
            scenario=run.scenario,
            label=label,
            severity=severity,
            trigger_condition={'rule': matched},
            consequence_payload=consequence,
            parent=None,
            phase=run.phase,
        )

        IncidentEvent.objects.create(
            run=run,
            event_type='escalation_triggered',
            actor=None,
            payload={
                'rule': matched,
                'new_threat_label': label,
                'severity': severity,
                'threat_id': str(threat.id),
            }
        )

        session_state = run.session_state or {}
        active = session_state.get('active_threats') or []
        if not isinstance(active, list):
            active = []
        active.append({'id': str(threat.id), 'label': label, 'severity': severity, 'phase': run.phase})
        session_state['active_threats'] = active
        run.session_state = session_state
        return {'rule': matched, 'threat': {'id': str(threat.id), 'label': label, 'severity': severity}}

    def compute_final_score(self, run):
        """
        Compute end-of-mission score.

        1. Get all IncidentEvents of type action_submitted for this run
        2. Count correct vs total
        3. Base accuracy = correct / total * 100
        4. Time bonus: if average latency < 30000ms, add 10 points
        5. Hint penalty: -5 per hint_requested event
        6. Escalation penalty: -15 per escalation_triggered event
        7. Clamp final score to 0-100
        8. passed = final_score >= run.scenario.passing_score
        9. grade:
             90-100 = 'A', 80-89 = 'B', 70-79 = 'C',
             60-69 = 'D', below 60 = 'F'
        10. Return {
              score: float,
              passed: bool,
              grade: str,
              breakdown: {
                accuracy_score, time_bonus, hint_penalty,
                escalation_penalty, decisions_correct,
                decisions_total
              }
            }
        """
        submitted = IncidentEvent.objects.filter(run=run, event_type='action_submitted').order_by('timestamp')
        total = submitted.count()
        correct = 0
        latencies = []
        for ev in submitted:
            payload = ev.payload or {}
            if payload.get('is_correct') is True:
                correct += 1
            latency = payload.get('latency_ms')
            if isinstance(latency, (int, float)):
                latencies.append(float(latency))

        accuracy_score = (correct / total * 100) if total else 0.0
        avg_latency = (sum(latencies) / len(latencies)) if latencies else 0.0
        time_bonus = 10.0 if total and avg_latency < 30000 else 0.0

        hint_count = IncidentEvent.objects.filter(run=run, event_type='hint_requested').count()
        escalation_count = IncidentEvent.objects.filter(run=run, event_type='escalation_triggered').count()

        hint_penalty = float(hint_count) * 5.0
        escalation_penalty = float(escalation_count) * 15.0

        raw = accuracy_score + time_bonus - hint_penalty - escalation_penalty
        final_score = max(0.0, min(100.0, float(raw)))

        passed = final_score >= float(run.scenario.passing_score)
        if final_score >= 90:
            grade = 'A'
        elif final_score >= 80:
            grade = 'B'
        elif final_score >= 70:
            grade = 'C'
        elif final_score >= 60:
            grade = 'D'
        else:
            grade = 'F'

        return {
            'score': float(final_score),
            'passed': bool(passed),
            'grade': grade,
            'breakdown': {
                'accuracy_score': float(accuracy_score),
                'time_bonus': float(time_bonus),
                'hint_penalty': float(hint_penalty),
                'escalation_penalty': float(escalation_penalty),
                'decisions_correct': int(correct),
                'decisions_total': int(total),
            }
        }

