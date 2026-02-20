from django.urls import path
from .views import dashboard, create_sale

urlpatterns = [
    path('', dashboard, name='dashboard'),
    path('venta/', create_sale, name='create_sale'),
]

