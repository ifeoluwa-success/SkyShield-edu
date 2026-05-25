"""Scale presets and regional fixtures for database seeding."""
from __future__ import annotations

DEFAULT_PASSWORD = 'SkyShieldSeed2026!'

# Demo accounts always recreated (documented in command output)
PINNED_ACCOUNTS = [
    {
        'email': 'admin@skyshield.africa',
        'username': 'skyshield_admin',
        'role': 'admin',
        'first_name': 'Adaeze',
        'last_name': 'Okafor',
        'status': 'active',
        'job_title': 'Platform Administrator',
    },
    {
        'email': 'supervisor@skyshield.africa',
        'username': 'skyshield_supervisor',
        'role': 'supervisor',
        'first_name': 'Chinedu',
        'last_name': 'Eze',
        'status': 'active',
        'job_title': 'Chief Training Supervisor',
    },
    {
        'email': 'instructor@skyshield.africa',
        'username': 'skyshield_instructor',
        'role': 'instructor',
        'first_name': 'Fatima',
        'last_name': 'Bello',
        'status': 'active',
        'job_title': 'Lead Aviation Security Instructor',
    },
    {
        'email': 'trainee@skyshield.africa',
        'username': 'skyshield_trainee',
        'role': 'trainee',
        'first_name': 'Pelumi',
        'last_name': 'Adeyemi',
        'status': 'active',
        'job_title': 'ATC Trainee',
        'training_level': 'Intermediate',
    },
]

FIRST_NAMES_M = [
    'Chukwuemeka', 'Oluwaseun', 'Ibrahim', 'Yusuf', 'Tunde', 'Emeka', 'Babatunde',
    'Olumide', 'Kelechi', 'Musa', 'Ahmed', 'Segun', 'Femi', 'Nnamdi', 'Uche',
]
FIRST_NAMES_F = [
    'Adaeze', 'Ngozi', 'Amina', 'Fatima', 'Zainab', 'Blessing', 'Chioma', 'Halima',
    'Folake', 'Yewande', 'Aisha', 'Kemi', 'Ifeoma', 'Hadiza', 'Ronke',
]
LAST_NAMES = [
    'Okafor', 'Adeyemi', 'Bello', 'Eze', 'Nwosu', 'Okonkwo', 'Mohammed', 'Sani',
    'Adebayo', 'Chukwu', 'Obi', 'Yakubu', 'Ogunleye', 'Danjuma', 'Abiola',
    'Oladipo', 'Mensah', 'Boateng', 'Kamau', 'Mwangi', 'Ndlovu', 'Diallo',
]
ORGANIZATIONS = [
    'Nigerian Civil Aviation Authority',
    'Federal Airports Authority of Nigeria',
    'Arik Air Training Academy',
    'Air Peace Operations Centre',
    'NCAA Aviation Security Unit',
    'Lagos ATC Training School',
    'Abuja Radar Approach Centre',
    'SkyShield Africa Academy',
    'ECOWAS Aviation Security Programme',
    'Kenya Civil Aviation Authority',
]
DEPARTMENTS = [
    'Air Traffic Control', 'Aviation Security', 'Cyber Defence', 'Operations',
    'Training & Standards', 'Incident Response', 'Navigation Services',
]
CITIES_NG = [
    ('Lagos', 'Lagos State'), ('Abuja', 'FCT'), ('Kano', 'Kano State'),
    ('Port Harcourt', 'Rivers State'), ('Enugu', 'Enugu State'),
]
THREAT_TOPICS = [
    ('GPS Spoofing over Lagos TMA', 'gps_spoofing', 'navigation'),
    ('ADS-B Ghost Aircraft Injection', 'data_corruption', 'data_integrity'),
    ('ATC Frequency Jamming', 'jamming', 'communication'),
    ('Phishing Against Ops Staff', 'phishing', 'social_engineering'),
    ('Ransomware on MET Briefing Workstation', 'ransomware', 'ransomware'),
    ('Unauthorized Radar Workstation Access', 'atc_access', 'unauthorized_access'),
    ('Man-in-the-Middle on AFTN Gateway', 'man_in_middle', 'communication'),
    ('DDoS on Crew Scheduling Portal', 'dos', 'unauthorized_access'),
]

SCALES = {
    'small': {
        'admins': 2,
        'supervisors': 4,
        'instructors': 5,
        'trainees': 35,
        'scenarios': 12,
        'courses': 6,
        'materials': 25,
        'paths': 4,
        'sessions': 80,
        'incident_runs': 25,
        'meetings': 15,
        'exercises': 10,
        'activities_per_user': 8,
        'api_logs': 200,
    },
    'medium': {
        'admins': 3,
        'supervisors': 10,
        'instructors': 12,
        'trainees': 120,
        'scenarios': 28,
        'courses': 14,
        'materials': 55,
        'paths': 8,
        'sessions': 350,
        'incident_runs': 90,
        'meetings': 45,
        'exercises': 28,
        'activities_per_user': 15,
        'api_logs': 800,
    },
    'large': {
        'admins': 5,
        'supervisors': 18,
        'instructors': 22,
        'trainees': 400,
        'scenarios': 45,
        'courses': 22,
        'materials': 90,
        'paths': 12,
        'sessions': 1200,
        'incident_runs': 280,
        'meetings': 120,
        'exercises': 55,
        'activities_per_user': 25,
        'api_logs': 2500,
    },
}
