from django.contrib import admin
from django.urls import path, include
from django.views.generic import RedirectView
from django.templatetags.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('core.urls')),
    path('', include('django.contrib.auth.urls')),

    # Favicon mapping directo
    path(
        "favicon.ico",
        RedirectView.as_view(url=static("favicon.ico"), permanent=True),
    ),
]

