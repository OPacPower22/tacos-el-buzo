from django.shortcuts import render
from django.utils import timezone
from django.db.models import Sum
from .models import Sale, Ingredient
from datetime import datetime
from django.db import models
from django.contrib.auth.decorators import login_required
from .forms import SaleForm
from .models import Sale, SaleDetail
from django.shortcuts import redirect
from django.db import transaction
from django.contrib import messages




@login_required
def dashboard(request):

    today = timezone.now().date()

    # Ventas del día
    sales_today = Sale.objects.filter(date__date=today)
    total_today = sales_today.aggregate(
        total=Sum('total')
    )['total'] or 0

    # Ventas del mes
    first_day_month = today.replace(day=1)

    sales_month = Sale.objects.filter(
        date__date__gte=first_day_month
    )

    total_month = sales_month.aggregate(
        total=Sum('total')
    )['total'] or 0

    profit_month = sales_month.aggregate(
        profit=Sum('profit')
    )['profit'] or 0

    # Stock bajo mínimo
    low_stock = Ingredient.objects.filter(
        stock__lte=models.F('minimum_stock'),
        active=True
    )

    context = {
        'total_today': total_today,
        'total_month': total_month,
        'profit_month': profit_month,
        'low_stock': low_stock,
    }

    return render(request, 'dashboard.html', context)

@login_required
def create_sale(request):

    if request.method == "POST":
        form = SaleForm(request.POST)

        if form.is_valid():

            product = form.cleaned_data["product"]
            quantity = form.cleaned_data["quantity"]
            payment_method = form.cleaned_data["payment_method"]

            with transaction.atomic():

                sale = Sale.objects.create(
                    payment_method=payment_method
                )

                SaleDetail.objects.create(
                    sale=sale,
                    product=product,
                    quantity=quantity,
                    price=product.price
                )

            messages.success(
                request,
                "Venta registrada correctamente."
            )

            return redirect("dashboard")

    else:
        form = SaleForm()

    return render(request, "sale.html", {"form": form})
