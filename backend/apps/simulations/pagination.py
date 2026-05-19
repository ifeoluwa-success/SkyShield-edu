from rest_framework.pagination import PageNumberPagination


class IncidentEventPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200
