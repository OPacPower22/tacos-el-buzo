from django import forms
from .models import Product, Sale


class SaleForm(forms.Form):

    product = forms.ModelChoiceField(
        queryset=Product.objects.filter(active=True),
        label="Producto"
    )

    quantity = forms.IntegerField(
        min_value=1,
        label="Cantidad"
    )

    payment_method = forms.ChoiceField(
        choices=Sale.PAYMENT_CHOICES,
        label="Método de pago"
    )

