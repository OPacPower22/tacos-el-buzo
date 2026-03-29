from django.db import models
from decimal import Decimal


class Ingredient(models.Model):

    UNIT_CHOICES = (
        ('kg', 'Kilogramo'),
        ('gr', 'Gramo'),
        ('lt', 'Litro'),
        ('pz', 'Pieza'),
    )

    name = models.CharField(max_length=100)
    unit = models.CharField(max_length=10, choices=UNIT_CHOICES)
    cost_per_unit = models.DecimalField(max_digits=10, decimal_places=4)
    stock = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    minimum_stock = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class Product(models.Model):

    name = models.CharField(max_length=100)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.name

    def calculate_cost(self):
        total = Decimal('0.00')
        for recipe in self.recipes.all():
            total += recipe.ingredient.cost_per_unit * recipe.quantity
        return total

    def calculate_profit(self):
        return self.price - self.calculate_cost()

class Recipe(models.Model):

    product = models.ForeignKey(
        Product,
        related_name='recipes',
        on_delete=models.CASCADE
    )

    ingredient = models.ForeignKey(
        Ingredient,
        on_delete=models.CASCADE
    )

    quantity = models.DecimalField(
        max_digits=10,
        decimal_places=3
    )

    class Meta:
        unique_together = ('product', 'ingredient')

    def __str__(self):
        return f"{self.product.name} - {self.ingredient.name}"

from django.utils import timezone
from django.db import transaction

class Purchase(models.Model):

    date = models.DateTimeField(default=timezone.now)
    supplier = models.CharField(max_length=150)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    def __str__(self):
        return f"Compra #{self.id} - {self.date.date()}"

class PurchaseDetail(models.Model):

    purchase = models.ForeignKey(
        Purchase,
        related_name='details',
        on_delete=models.CASCADE
    )

    ingredient = models.ForeignKey(
        Ingredient,
        on_delete=models.CASCADE
    )

    quantity = models.DecimalField(max_digits=10, decimal_places=3)
    cost_per_unit = models.DecimalField(max_digits=10, decimal_places=4)

    def save(self, *args, **kwargs):

        # SOLO ejecutar lógica si es creación
        if self.pk:
            raise ValueError("No se permite editar un detalle de compra.")

        with transaction.atomic():

            super().save(*args, **kwargs)

            ingredient = self.ingredient

            current_stock_value = ingredient.stock * ingredient.cost_per_unit
            new_stock_value = self.quantity * self.cost_per_unit
            total_quantity = ingredient.stock + self.quantity

            if total_quantity <= 0:
                raise ValueError("Cantidad inválida.")

            ingredient.cost_per_unit = (
                current_stock_value + new_stock_value
            ) / total_quantity

            ingredient.stock = total_quantity
            ingredient.save()

            # Actualizar total de compra
            self.purchase.total += self.quantity * self.cost_per_unit
            self.purchase.save()

class Sale(models.Model):

    PAYMENT_CHOICES = (
        ('efectivo', 'Efectivo'),
        ('tarjeta', 'Tarjeta'),
        ('transferencia', 'Transferencia'),
    )

    date = models.DateTimeField(default=timezone.now)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    profit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_CHOICES)

    def __str__(self):
        return f"Venta #{self.id} - {self.date.date()}"

    def delete(self, *args, **kwargs):
    raise ValueError("No se permite eliminar ventas registradas.")

class SaleDetail(models.Model):

    sale = models.ForeignKey(
        Sale,
        related_name='details',
        on_delete=models.CASCADE
    )

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE
    )

    quantity = models.PositiveIntegerField()
    price = models.DecimalField(max_digits=10, decimal_places=2)

    def save(self, *args, **kwargs):

        # SOLO ejecutar lógica si es creación
        if self.pk:
            raise ValueError("No se permite editar un detalle de venta.")

        with transaction.atomic():

            if not self.product.recipes.exists():
                raise ValueError("El producto no tiene receta definida.")

            super().save(*args, **kwargs)

            total_cost = Decimal('0.00')

            for recipe in self.product.recipes.all():

                ingredient = recipe.ingredient
                required_qty = recipe.quantity * self.quantity

                if ingredient.stock < required_qty:
                    raise ValueError(
                        f"Stock insuficiente de {ingredient.name}"
                    )

                ingredient.stock -= required_qty
                ingredient.save()

                total_cost += ingredient.cost_per_unit * required_qty

            # Actualizar venta
            self.sale.total += self.price * self.quantity
            self.sale.cost += total_cost
            self.sale.profit = self.sale.total - self.sale.cost
            self.sale.save()

    def delete(self, *args, **kwargs):
        raise ValueError("No se permite eliminar un detalle de venta.")
