/**
 * 🗄️ DB Module — Electric Shop App (فانوس)
 * Primary: localStorage (always works offline)
 * Cloud:  CloudSync module syncs on every save (debounced 3s)
 */

// Persian date utilities
function gregorianToJalali(gy, gm, gd) {
    const g_days_in_month = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const j_days_in_month = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
    let gy2 = (gm > 2) ? (gy + 1) : gy;
    let days = 355666 + (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd;
    for (let i = 0; i < gm - 1; ++i) days += g_days_in_month[i];
    let jy = -1595 + (33 * Math.floor(days / 12053));
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
        jy += Math.floor((days - 1) / 365);
        days = (days - 1) % 365;
    }
    let jm, jd;
    if (days < 186) {
        jm = 1 + Math.floor(days / 31);
        jd = 1 + (days % 31);
    } else {
        jm = 7 + Math.floor((days - 186) / 30);
        jd = 1 + ((days - 186) % 30);
    }
    return [jy, jm, jd];
}

function todayJalali() {
    const d = new Date();
    const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`;
}

const DB = {
    key: 'electric_shop_db',
    
    init() {
        if (!localStorage.getItem(this.key)) {
            const defaultData = {
                shop: { name: 'دکان لوازم برقی', address: '', phone: '' },
                initialCapital: 0,
                marketDebt: 0,
                products: [],
                sales: [],
                repairs: [],
                projects: [],
                employees: [
                    { id: 1, name: 'شریک تجاری', role: 'شریک', phone: '', salary: 0, paid: 0, debt: 0 },
                    { id: 2, name: 'کارگر ۱', role: 'کارگر', phone: '', salary: 8000, paid: 0, debt: 0 },
                ],
                transactions: [],
                debtors: [],
                purchases: [],
                assets: [],
                nextIds: { product: 1, sale: 1, repair: 1, project: 1, employee: 3, transaction: 1, debtor: 1, purchase: 1, asset: 1 }
            };
            this.save(defaultData);
        }
    },
    
    getAll() {
        const data = JSON.parse(localStorage.getItem(this.key));
        // Ensure backward compatibility for old data
        if (!data.debtors) data.debtors = [];
        if (!data.nextIds) data.nextIds = {};
        if (!data.nextIds.debtor) data.nextIds.debtor = 1;
        if (!data.nextIds.purchase) data.nextIds.purchase = 1;
        if (!data.purchases) data.purchases = [];
        if (!data.nextIds.asset) data.nextIds.asset = 1;
        if (!data.assets) data.assets = [];
        if (typeof data.initialCapital !== 'number') data.initialCapital = 0;
        if (typeof data.marketDebt !== 'number') data.marketDebt = 0;
        return data;
    },
    
    save(data) {
        localStorage.setItem(this.key, JSON.stringify(data));
        // 🔔 Notify cloud sync (debounced push)
        window.dispatchEvent(new Event('db-save'));
    },
    
    getNextId(type, data) {
        const id = data.nextIds[type] || 1;
        data.nextIds[type] = id + 1;
        return id;
    },

    // Purchases
    getPurchases() { return this.getAll().purchases; },
    addPurchase(purchase) {
        const data = this.getAll();
        purchase.id = this.getNextId('purchase', data);
        purchase.date = purchase.date || todayJalali();
        purchase.invoiceNo = (purchase.invoiceNo || '').toString().trim();

        // Support both old single-item and new multi-item formats
        if (purchase.items && purchase.items.length > 0) {
            // Multi-item purchase
            purchase.items.forEach(item => {
                item.productName = (item.productName || '').trim();
                item.unit = (item.unit || '').toString().trim() || 'دانه';
                if (item.unit === 'عدد') item.unit = 'دانه';
                item.qty = Number(item.qty) || 0;
                item.unitPrice = Number(item.unitPrice) || 0;
                item.sellPrice = Number(item.sellPrice) || item.unitPrice;
                item.lineTotal = item.qty * item.unitPrice;
            });
            purchase.total = purchase.items.reduce((sum, item) => sum + item.lineTotal, 0);
        } else {
            // Legacy single-item format (backward compat)
            purchase.items = [{
                productName: purchase.productName || '',
                unit: (purchase.unit || 'دانه'),
                qty: Number(purchase.qty) || 0,
                unitPrice: Number(purchase.unitPrice) || 0,
                sellPrice: Number(purchase.sellPrice) || (Number(purchase.unitPrice) || 0),
                lineTotal: (Number(purchase.qty) || 0) * (Number(purchase.unitPrice) || 0)
            }];
            purchase.total = purchase.items[0].lineTotal;
        }

        purchase.paid = Number(purchase.paid) || 0;
        purchase.remaining = purchase.total - purchase.paid;
        if (purchase.remaining < 0) purchase.remaining = 0;

        // Add or update each item's product in inventory
        purchase.items.forEach(item => {
            if (!item.productName) return;
            let product = data.products.find(p => p.name === item.productName && p.buyPrice === item.unitPrice && p.sellPrice === item.sellPrice && ((p.unit || 'دانه') === item.unit || (p.unit === 'عدد' && item.unit === 'دانه')));
            if (product) {
                product.stock += item.qty;
                if (!product.unit || product.unit === 'عدد') product.unit = item.unit;
                if (item.unitPrice > 0) product.buyPrice = item.unitPrice;
                item.productId = product.id;
            } else {
                const maxId = data.products.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0);
                if (!data.nextIds) data.nextIds = {};
                if (!(data.nextIds.product > maxId)) data.nextIds.product = maxId + 1;
                const newProduct = {
                    id: this.getNextId('product', data),
                    name: item.productName,
                    unit: item.unit,
                    buyPrice: item.unitPrice,
                    sellPrice: item.sellPrice,
                    stock: item.qty
                };
                data.products.push(newProduct);
                item.productId = newProduct.id;
            }
        });

        // Add to market debt if not fully paid
        if (purchase.remaining > 0) {
            data.marketDebt = (data.marketDebt || 0) + purchase.remaining;
        }

        // Add expense transaction for paid amount
        if (purchase.paid > 0) {
            const itemNames = purchase.items.map(i => i.productName).join('، ');
            const tr = {
                type: 'expense',
                description: `خریداری: ${itemNames} از ${purchase.supplier || 'بازار'}`,
                amount: purchase.paid,
                category: 'خرید جنس',
                date: purchase.date,
                refType: 'purchase',
                refId: purchase.id
            };
            tr.id = this.getNextId('transaction', data);
            data.transactions.push(tr);
        }

        data.purchases.push(purchase);
        this.save(data);
        return purchase;
    },
    deletePurchase(id) {
        const data = this.getAll();
        const purchase = data.purchases.find(p => p.id === id);
        if (purchase) {
            // Reverse stock for each item
            const items = purchase.items || [];
            items.forEach(item => {
                if (!item.productId) return;
                const product = data.products.find(p => p.id === item.productId);
                if (product) {
                    product.stock -= item.qty;
                    if (product.stock < 0) product.stock = 0;
                }
            });
            // Reverse market debt
            if (purchase.remaining > 0) {
                data.marketDebt = (data.marketDebt || 0) - purchase.remaining;
                if (data.marketDebt < 0) data.marketDebt = 0;
            }
        }
        data.purchases = data.purchases.filter(p => p.id !== id);
        data.transactions = data.transactions.filter(t => !(t.refType === 'purchase' && t.refId === id));
        this.save(data);
    },

    // Assets (اموال دکان)
    getAssets() { return this.getAll().assets; },
    addAsset(asset) {
        const data = this.getAll();
        asset.id = this.getNextId('asset', data);
        asset.name = (asset.name || '').trim();
        asset.qty = Number(asset.qty) || 1;
        asset.unitPrice = Number(asset.unitPrice) || 0;
        asset.total = asset.qty * asset.unitPrice;
        asset.purchaseDate = asset.purchaseDate || todayJalali();
        asset.supplier = (asset.supplier || '').trim();
        asset.status = asset.status || 'فعال';
        asset.notes = (asset.notes || '').trim();
        data.assets.push(asset);
        // Register as expense transaction
        const tr = {
            type: 'expense',
            description: `خرید اموال: ${asset.name} (${asset.qty} عدد)`,
            amount: asset.total,
            category: 'خرید اموال',
            date: asset.purchaseDate,
            refType: 'asset',
            refId: asset.id
        };
        tr.id = this.getNextId('transaction', data);
        data.transactions.push(tr);
        this.save(data);
        return asset;
    },
    updateAsset(id, updates) {
        const data = this.getAll();
        const idx = data.assets.findIndex(a => a.id === id);
        if (idx !== -1) {
            data.assets[idx] = { ...data.assets[idx], ...updates };
            data.assets[idx].total = (data.assets[idx].qty || 1) * (data.assets[idx].unitPrice || 0);
            this.save(data);
        }
    },
    deleteAsset(id) {
        const data = this.getAll();
        data.assets = data.assets.filter(a => a.id !== id);
        data.transactions = data.transactions.filter(t => !(t.refType === 'asset' && t.refId === id));
        this.save(data);
    },

    // Products
    getProducts() { return this.getAll().products; },
    addProduct(product) {
        const data = this.getAll();
        // Never reuse a retired code: keep the counter above the highest existing code
        const maxId = data.products.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0);
        if (!data.nextIds) data.nextIds = {};
        if (!(data.nextIds.product > maxId)) data.nextIds.product = maxId + 1;
        product.id = this.getNextId('product', data);
        data.products.push(product);
        this.save(data);
        return product;
    },
    updateProduct(id, updated) {
        const data = this.getAll();
        const idx = data.products.findIndex(p => p.id === id);
        if (idx > -1) {
            data.products[idx] = { ...data.products[idx], ...updated };
            this.save(data);
        }
    },
    deleteProduct(id) {
        const data = this.getAll();
        data.products = data.products.filter(p => p.id !== id);
        // NOTE: product codes are intentionally NOT renumbered on delete.
        // A deleted code stays permanently retired so old invoices/reports keep matching.
        this.save(data);
    },

    /* Re-number product codes to 1..N (used only for the one-time alignment).
       Also remaps productId references inside sales and purchases. */
    _renumberProducts(data) {
        const map = {};
        data.products.forEach((p, i) => {
            const newId = i + 1;
            if (p.id !== newId) map[p.id] = newId;
            p.id = newId;
        });
        const remap = list => {
            (list || []).forEach(rec => {
                (rec.items || []).forEach(item => {
                    if (item.productId && map[item.productId]) item.productId = map[item.productId];
                });
            });
        };
        remap(data.sales);
        remap(data.purchases);
        if (!data.nextIds) data.nextIds = {};
        data.nextIds.product = data.products.length + 1;
        return data;
    },

    /* One-time only: align existing product codes to start at 1.
       Runs once ever; afterwards codes are permanent and gaps are kept. */
    normalizeProductIds() {
        const data = this.getAll();
        if (data.productIdsNormalized) return;
        this._renumberProducts(data);
        data.productIdsNormalized = true;
        this.save(data);
    },
    getProduct(id) {
        return this.getAll().products.find(p => p.id === id);
    },
    
    // Sales
    getSales() { return this.getAll().sales; },
    addSale(sale) {
        const data = this.getAll();
        sale.id = this.getNextId('sale', data);
        sale.date = sale.date || todayJalali();
        sale.paid = Number(sale.paid) || 0;
        sale.debt = Number(sale.debt) || 0;
        data.sales.push(sale);
        // Reduce stock
        sale.items.forEach(item => {
            const p = data.products.find(pr => pr.id === item.productId);
            if (p) p.stock -= item.qty;
        });
        // Add transaction inline (based on paid amount)
        if (sale.paid > 0) {
            const tr = {
                type: 'income',
                description: `فاکتور فروش #${sale.id} - ${sale.customer}`,
                amount: sale.paid,
                category: 'فروش',
                date: sale.date,
                refType: 'sale',
                refId: sale.id
            };
            tr.id = this.getNextId('transaction', data);
            data.transactions.push(tr);
        }
        // Add to debtors if any debt (using same data object)
        if (sale.debt > 0) {
            let debtor = data.debtors.find(d => d.name === sale.customer);
            if (debtor) {
                debtor.totalDebt += sale.debt;
                debtor.lastSaleDate = sale.date;
                if (!debtor.saleIds.includes(sale.id)) debtor.saleIds.push(sale.id);
                if (sale.phone) debtor.phone = sale.phone;
            } else {
                debtor = {
                    id: this.getNextId('debtor', data),
                    name: sale.customer,
                    phone: sale.phone || '',
                    totalDebt: sale.debt,
                    lastSaleDate: sale.date,
                    saleIds: [sale.id]
                };
                data.debtors.push(debtor);
            }
        }
        this.save(data);
        return sale;
    },
    deleteSale(id) {
        const data = this.getAll();
        const sale = data.sales.find(s => s.id === id);
        // Return stock to inventory
        if (sale && sale.items) {
            sale.items.forEach(item => {
                const p = data.products.find(pr => pr.id === item.productId);
                if (p) p.stock += item.qty;
            });
        }
        data.sales = data.sales.filter(s => s.id !== id);
        // Remove linked transactions
        data.transactions = data.transactions.filter(t => !(t.refType === 'sale' && t.refId === id));
        // Remove/update debtor (using same data object)
        if (sale && sale.debt > 0) {
            const debtor = data.debtors.find(d => d.saleIds.includes(sale.id));
            if (debtor) {
                debtor.totalDebt -= sale.debt;
                debtor.saleIds = debtor.saleIds.filter(sid => sid !== sale.id);
                if (debtor.totalDebt <= 0) {
                    data.debtors = data.debtors.filter(d => d.id !== debtor.id);
                }
            }
        }
        this.save(data);
    },
    
    // Repairs
    getRepairs() {
        const data = this.getAll();
        data.repairs.forEach(r => {
            if (typeof r.paid !== 'number') r.paid = 0;
            if (typeof r.remaining !== 'number') r.remaining = (r.cost || 0) - r.paid;
        });
        return data.repairs;
    },
    addRepair(repair) {
        const data = this.getAll();
        repair.id = this.getNextId('repair', data);
        repair.receiveDate = repair.receiveDate || todayJalali();
        repair.cost = Number(repair.cost) || 0;
        repair.paid = Number(repair.paid) || 0;
        repair.remaining = repair.cost - repair.paid;
        data.repairs.push(repair);
        this.save(data);
        return repair;
    },
    updateRepair(id, updated) {
        const data = this.getAll();
        const idx = data.repairs.findIndex(r => r.id === id);
        if (idx > -1) {
            const old = data.repairs[idx];
            const merged = { ...old, ...updated };
            merged.cost = Number(merged.cost) || 0;
            merged.paid = Number(merged.paid) || 0;
            merged.remaining = merged.cost - merged.paid;
            data.repairs[idx] = merged;

            const isCompleted = s => s === 'تکمیل‌شده' || s === 'تحویل‌داده‌شده';

            // Status changed to completed -> add income based on paid amount
            if (isCompleted(updated.status) && !isCompleted(old.status)) {
                const tr = {
                    type: 'income',
                    description: `تعمیر #${id} - ${old.device}`,
                    amount: merged.paid,
                    category: 'تعمیرات',
                    date: todayJalali(),
                    refType: 'repair',
                    refId: id
                };
                tr.id = this.getNextId('transaction', data);
                data.transactions.push(tr);
            }
            // Status changed from completed to non-completed -> remove income
            else if (isCompleted(old.status) && !isCompleted(updated.status)) {
                data.transactions = data.transactions.filter(t => !(t.refType === 'repair' && t.refId === id));
            }
            // If already completed and paid changed, update transaction amount
            else if (isCompleted(old.status) && isCompleted(updated.status)) {
                const tr = data.transactions.find(t => t.refType === 'repair' && t.refId === id);
                if (tr) tr.amount = merged.paid;
            }

            this.save(data);
        }
    },
    payRepair(id, amount) {
        const data = this.getAll();
        const idx = data.repairs.findIndex(r => r.id === id);
        if (idx > -1) {
            const repair = data.repairs[idx];
            repair.paid = (repair.paid || 0) + amount;
            repair.remaining = (repair.cost || 0) - repair.paid;
            if (repair.remaining < 0) repair.remaining = 0;
            // Add income transaction for payment
            const tr = {
                type: 'income',
                description: `پرداخت تعمیر #${id} - ${repair.device}`,
                amount: amount,
                category: 'تعمیرات',
                date: todayJalali(),
                refType: 'repair_payment',
                refId: id
            };
            tr.id = this.getNextId('transaction', data);
            data.transactions.push(tr);
            this.save(data);
            return repair;
        }
    },
    deleteRepair(id) {
        const data = this.getAll();
        data.repairs = data.repairs.filter(r => r.id !== id);
        // Remove linked transactions
        data.transactions = data.transactions.filter(t => !(t.refType === 'repair' && t.refId === id));
        this.save(data);
    },
    
    // Projects
    getProjects() { return this.getAll().projects; },
    addProject(project) {
        const data = this.getAll();
        project.id = this.getNextId('project', data);
        project.startDate = project.startDate || todayJalali();
        project.paid = project.paid || 0;
        data.projects.push(project);
        this.save(data);
        return project;
    },
    updateProject(id, updated) {
        const data = this.getAll();
        const idx = data.projects.findIndex(p => String(p.id) === String(id));
        if (idx > -1) {
            data.projects[idx] = { ...data.projects[idx], ...updated };
            this.save(data);
        }
    },
    deleteProject(id) {
        const data = this.getAll();
        data.projects = data.projects.filter(p => String(p.id) !== String(id));
        // Remove linked transactions
        data.transactions = data.transactions.filter(t => !(t.refType === 'project' && String(t.refId) === String(id)));
        this.save(data);
    },
    
    // Employees
    getEmployees() { return this.getAll().employees; },
    addEmployee(emp) {
        const data = this.getAll();
        emp.id = this.getNextId('employee', data);
        emp.paid = 0;
        emp.debt = 0;
        data.employees.push(emp);
        this.save(data);
        return emp;
    },
    updateEmployee(id, updated) {
        const data = this.getAll();
        const idx = data.employees.findIndex(e => e.id === id);
        if (idx > -1) {
            data.employees[idx] = { ...data.employees[idx], ...updated };
            this.save(data);
        }
    },
    deleteEmployee(id) {
        const data = this.getAll();
        data.employees = data.employees.filter(e => e.id !== id);
        // Remove linked transactions
        data.transactions = data.transactions.filter(t => !(t.refType === 'employee' && t.refId === id));
        this.save(data);
    },
    
    // Transactions
    getTransactions() { return this.getAll().transactions; },
    addTransaction(tr) {
        const data = this.getAll();
        tr.id = this.getNextId('transaction', data);
        tr.date = tr.date || todayJalali();
        data.transactions.push(tr);
        this.save(data);
        return tr;
    },
    deleteTransaction(id) {
        const data = this.getAll();
        data.transactions = data.transactions.filter(t => t.id !== id);
        this.save(data);
    },

    // Debtors - dynamically built from sales, repairs, and projects
    getDebtors() {
        const data = this.getAll();
        const map = {};

        const addPerson = (name, phone, type, id, amount, date) => {
            if (!name || amount <= 0) return;
            if (!map[name]) {
                map[name] = {
                    id: name,
                    name,
                    phone: phone || '',
                    totalDebt: 0,
                    lastDate: date,
                    sources: []
                };
            }
            map[name].totalDebt += amount;
            if (date && date > (map[name].lastDate || '')) map[name].lastDate = date;
            map[name].sources.push({ type, id, amount });
            if (phone && !map[name].phone) map[name].phone = phone;
        };

        // From sales
        data.sales.forEach(s => {
            if (s.debt > 0) addPerson(s.customer, s.phone, 'sale', s.id, s.debt, s.date);
        });

        // From repairs
        data.repairs.forEach(r => {
            if (r.remaining > 0) addPerson(r.customer || r.owner, r.phone, 'repair', r.id, r.remaining, r.receiveDate);
        });

        // From projects
        data.projects.forEach(p => {
            const remaining = (p.amount || 0) - (p.paid || 0);
            if (remaining > 0) addPerson(p.client || p.customer || p.name, p.phone, 'project', p.id, remaining, p.startDate);
        });

        return Object.values(map);
    },

    // Creditors - dynamically built from purchases
    getCreditors() {
        const data = this.getAll();
        const map = {};

        data.purchases.forEach(p => {
            if (p.remaining > 0) {
                const name = p.supplier || 'نامشخص';
                if (!map[name]) {
                    map[name] = {
                        id: name,
                        name,
                        totalDebt: 0,
                        sources: []
                    };
                }
                map[name].totalDebt += p.remaining;
                map[name].sources.push({ type: 'purchase', id: p.id, amount: p.remaining });
            }
        });

        return Object.values(map);
    },

    addOrUpdateDebtor(name, phone, debtAmount, saleId, date) {
        // Kept for backward compatibility with addSale
        const data = this.getAll();
        let debtor = data.debtors.find(d => d.name === name);
        if (debtor) {
            debtor.totalDebt += debtAmount;
            debtor.lastSaleDate = date;
            if (!debtor.saleIds.includes(saleId)) debtor.saleIds.push(saleId);
            if (phone) debtor.phone = phone;
        } else {
            debtor = {
                id: this.getNextId('debtor', data),
                name,
                phone: phone || '',
                totalDebt: debtAmount,
                lastSaleDate: date,
                saleIds: [saleId]
            };
            data.debtors.push(debtor);
        }
        this.save(data);
        return debtor;
    },
    removeDebtorForSale(saleId, debtAmount) {
        const data = this.getAll();
        const debtor = data.debtors.find(d => d.saleIds.includes(saleId));
        if (debtor) {
            debtor.totalDebt -= debtAmount;
            debtor.saleIds = debtor.saleIds.filter(id => id !== saleId);
            if (debtor.totalDebt <= 0) {
                data.debtors = data.debtors.filter(d => d.id !== debtor.id);
            }
        }
        this.save(data);
    },
    deleteDebtor(id) {
        const data = this.getAll();
        data.debtors = data.debtors.filter(d => d.id !== id);
        this.save(data);
    },
    updateDebtor(id, updated) {
        const data = this.getAll();
        const idx = data.debtors.findIndex(d => d.id === id);
        if (idx > -1) {
            data.debtors[idx] = { ...data.debtors[idx], ...updated };
            this.save(data);
        }
    },
    payDebtor(id, amount, date) {
        const data = this.getAll();
        const debtors = this.getDebtors();
        const debtor = debtors.find(d => d.id === id);
        if (!debtor || amount <= 0) return false;

        const payDate = date || todayJalali();
        let remaining = amount;
        // Each portion of the payment is logged against its own source so that
        // sale / repair / project detail views can show it.
        const logs = [];

        // Pay sales first
        for (const source of debtor.sources.filter(s => s.type === 'sale')) {
            if (remaining <= 0) break;
            const sale = data.sales.find(s => s.id === source.id);
            if (sale && sale.debt > 0) {
                const pay = Math.min(remaining, sale.debt);
                sale.debt -= pay;
                sale.paid = (sale.paid || 0) + pay;
                remaining -= pay;
                logs.push({
                    description: `دریافت بدهی فروش #${sale.id} - ${debtor.name}`,
                    amount: pay,
                    category: 'بدهی مشتری',
                    refType: 'sale_payment',
                    refId: sale.id
                });
            }
        }

        // Then repairs
        for (const source of debtor.sources.filter(s => s.type === 'repair')) {
            if (remaining <= 0) break;
            const repair = data.repairs.find(r => r.id === source.id);
            if (repair && repair.remaining > 0) {
                const pay = Math.min(remaining, repair.remaining);
                repair.paid += pay;
                repair.remaining -= pay;
                remaining -= pay;
                logs.push({
                    description: `دریافت بدهی تعمیر #${repair.id} - ${debtor.name}`,
                    amount: pay,
                    category: 'بدهی مشتری',
                    refType: 'repair_payment',
                    refId: repair.id
                });
            }
        }

        // Then projects
        for (const source of debtor.sources.filter(s => s.type === 'project')) {
            if (remaining <= 0) break;
            const project = data.projects.find(p => String(p.id) === String(source.id));
            if (project) {
                const projRemaining = (project.amount || 0) - (project.paid || 0);
                if (projRemaining > 0) {
                    const pay = Math.min(remaining, projRemaining);
                    project.paid = (project.paid || 0) + pay;
                    remaining -= pay;
                    logs.push({
                        description: `پرداخت پروژه: ${project.name} (از قرض‌داری)`,
                        amount: pay,
                        category: 'پروژه',
                        refType: 'project',
                        refId: project.id
                    });
                }
            }
        }

        // Anything that could not be matched to a source stays as a generic payment
        if (remaining > 0) {
            logs.push({
                description: `دریافت بدهی - ${debtor.name}`,
                amount: remaining,
                category: 'بدهی مشتری',
                refType: 'debtor_payment',
                refId: id
            });
        }
        if (!logs.length) {
            logs.push({
                description: `دریافت بدهی - ${debtor.name}`,
                amount: amount,
                category: 'بدهی مشتری',
                refType: 'debtor_payment',
                refId: id
            });
        }

        for (const log of logs) {
            const tr = {
                type: 'income',
                description: log.description,
                amount: log.amount,
                category: log.category,
                date: payDate,
                refType: log.refType,
                refId: log.refId
            };
            tr.id = this.getNextId('transaction', data);
            data.transactions.push(tr);
        }

        this.save(data);
        return true;
    },
    payCreditor(id, amount, date) {
        const data = this.getAll();
        const creditors = this.getCreditors();
        const creditor = creditors.find(c => c.id === id);
        if (!creditor || amount <= 0) return false;

        let remaining = amount;

        for (const source of creditor.sources) {
            if (remaining <= 0) break;
            const purchase = data.purchases.find(p => p.id === source.id);
            if (purchase && purchase.remaining > 0) {
                const pay = Math.min(remaining, purchase.remaining);
                purchase.paid += pay;
                purchase.remaining -= pay;
                remaining -= pay;
            }
        }

        // Add expense transaction for payment
        const tr = {
            type: 'expense',
            description: `پرداخت بدهی به ${creditor.name}`,
            amount: amount,
            category: 'پرداخت بدهی',
            date: date || todayJalali(),
            refType: 'creditor_payment',
            refId: id
        };
        tr.id = this.getNextId('transaction', data);
        data.transactions.push(tr);

        this.save(data);
        return true;
    },

    // Initial Capital (سرمایه اولیه)
    getInitialCapital() { return this.getAll().initialCapital || 0; },
    setInitialCapital(amount) {
        const data = this.getAll();
        data.initialCapital = Number(amount) || 0;
        this.save(data);
    },

    // Shop
    getShop() { return this.getAll().shop; },
    updateShop(shop) {
        const data = this.getAll();
        data.shop = shop;
        this.save(data);
    },
    getMarketDebt() {
        const data = this.getAll();
        // Dynamically calculated from purchases remaining
        return data.purchases.reduce((sum, p) => sum + (p.remaining || 0), 0);
    },
    updateMarketDebt(val) {
        // Kept for backward compatibility, but value is now calculated dynamically
        const data = this.getAll();
        data.marketDebt = Number(val) || 0;
        this.save(data);
    },
    
    // Export/Import
    exportData() {
        return JSON.stringify(this.getAll(), null, 2);
    },
    importData(json) {
        const data = JSON.parse(json);
        this.save(data);
    },
    
    clearAll() {
        localStorage.removeItem(this.key);
        this.init();
    }
};

DB.init();
DB.normalizeProductIds();
// 🔔 Notify CloudSync that DB is ready
window.dispatchEvent(new Event('db-ready'));
