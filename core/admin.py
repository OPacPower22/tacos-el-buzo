from django.contrib import admin
from .models import (
    Ingredient,
    Product,
    Recipe,
    Purchase,
    PurchaseDetail,
    Sale,
    SaleDetail
)

@admin.register(Ingredient)
class IngredientAdmin(admin.ModelAdmin):
    list_display = ('name', 'unit', 'stock', 'cost_per_unit', 'minimum_stock', 'active')
    list_filter = ('active',)
    search_fields = ('name',)

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'price', 'active')
    list_filter = ('active',)
    search_fields = ('name',)

@admin.register(Recipe)
class RecipeAdmin(admin.ModelAdmin):
    list_display = ('product', 'ingredient', 'quantity')
    list_filter = ('product',)

class PurchaseDetailInline(admin.TabularInline):
    model = PurchaseDetail
    extra = 1


@admin.register(Purchase)
class PurchaseAdmin(admin.ModelAdmin):
    list_display = ('id', 'date', 'supplier', 'total')
    inlines = [PurchaseDetailInline]

class SaleDetailInline(admin.TabularInline):
    model = SaleDetail
    extra = 1


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ('id', 'date', 'payment_method', 'total', 'cost', 'profit')
    inlines = [SaleDetailInline]

