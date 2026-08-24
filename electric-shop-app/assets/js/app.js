// Utility
const $ = id => document.getElementById(id);
const formatMoney = n => Number(n || 0).toLocaleString('fa-AF') + ' ؋';
const toPersianDate = str => str ? str.replace(/-/g, '/') : '';
let txPage = 1;
const TX_PER_PAGE = 5;
let allTransactions = [];

// Modal System
const Modal = {
    open(title, bodyHtml, footerHtml = '') {
        $('modalTitle').textContent = title;
        $('modalBody').innerHTML = bodyHtml;
        $('modalFooter').innerHTML = footerHtml;
        $('modal').classList.add('active');
    },
    close() {
        $('modal').classList.remove('active');
    }
};

$('modalClose').onclick = () => Modal.close();
$('modal').onclick = e => { if (e.target === $('modal')) Modal.close(); };

// Navigation
const pages = ['dashboard', 'inventory', 'purchases', 'sales', 'repairs', 'projects', 'employees', 'finance', 'debtors', 'assets', 'reports', 'settings'];

// Toggle submenu (accordion)
document.querySelectorAll('.nav-toggle').forEach(toggle => {
    toggle.addEventListener('click', e => {
        e.preventDefault();
        const group = toggle.closest('.nav-group');
        const isOpen = group.classList.contains('open');
        document.querySelectorAll('.nav-group').forEach(g => g.classList.remove('open'));
        if (!isOpen) group.classList.add('open');
    });
});

// Page navigation
document.querySelectorAll('.nav-link[data-page]').forEach(link => {
    link.addEventListener('click', e => {
        e.preventDefault();
        const page = link.dataset.page;
        pages.forEach(p => $(p).classList.remove('active'));
        $(page).classList.add('active');
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        document.querySelectorAll('.nav-group').forEach(g => g.classList.remove('open'));
        const parentGroup = link.closest('.nav-group');
        if (parentGroup) parentGroup.classList.add('open');
        const titleSpan = link.querySelector('span:nth-child(2)');
        $('pageTitle').textContent = titleSpan ? titleSpan.textContent : link.textContent.trim();
        if (window.innerWidth <= 768) $('sidebar').classList.remove('open');
        refreshPage(page);
    });
});

$('menuToggle').onclick = () => $('sidebar').classList.toggle('open');
$('closeSidebar').onclick = () => $('sidebar').classList.remove('open');

function refreshPage(page) {
    if (page === 'dashboard') loadDashboard();
    if (page === 'inventory') loadInventory();
    if (page === 'purchases') loadPurchases();
    if (page === 'assets') loadAssets();
    if (page === 'sales') loadSales();
    if (page === 'repairs') loadRepairs();
    if (page === 'projects') loadProjects();
    if (page === 'employees') loadEmployees();
    if (page === 'finance') loadFinance();
    if (page === 'debtors') loadDebtors();
    if (page === 'reports') loadReports();
    if (page === 'settings') loadSettings();
}

// ==================== DASHBOARD ====================
function loadDashboard() {
    const data = DB.getAll();
    const todayStr = todayJalali();
    
    const todaySales = data.sales.filter(s => s.date === todayStr).reduce((sum, s) => sum + s.total, 0);
    const todayRepairs = data.repairs.filter(r => r.receiveDate === todayStr).length;
    const activeProjects = data.projects.filter(p => p.status !== 'تکمیل‌شده').length;
    const lowStock = data.products.filter(p => p.stock < 10).length;
    const inventoryValue = data.products.reduce((sum, p) => sum + (p.stock * (p.buyPrice || 0)), 0);
    const assetsValue = (data.assets || []).reduce((sum, a) => sum + (a.total || 0), 0);

    $('totalSales').textContent = formatMoney(todaySales);
    $('totalRepairs').textContent = todayRepairs;
    $('activeProjects').textContent = activeProjects;
    $('lowStock').textContent = lowStock;
    $('inventoryValue').textContent = formatMoney(inventoryValue);
    if ($('assetsValue')) $('assetsValue').textContent = formatMoney(assetsValue);
    
    // Recent repairs
    const recentRepairs = [...data.repairs].reverse().slice(0, 5);
    $('recentRepairs').innerHTML = recentRepairs.map(r => `
        <tr>
            <td>${r.customer}</td>
            <td>${r.device}</td>
            <td><span class="badge badge-${r.status === 'تکمیل‌شده' || r.status === 'تحویل‌داده‌شده' ? 'success' : r.status === 'در حال تعمیر' ? 'warning' : 'info'}">${r.status}</span></td>
            <td>${formatMoney(r.cost)}</td>
        </tr>
    `).join('') || '<tr><td colspan="4" style="text-align:center">تعمیراتی ثبت نشده</td></tr>';
    
    // Recent projects
    const recentProjects = data.projects.filter(p => p.status !== 'تکمیل‌شده').slice(0, 5);
    $('recentProjects').innerHTML = recentProjects.map(p => {
        const remaining = p.amount - p.paid;
        const progress = p.amount > 0 ? Math.round((p.paid / p.amount) * 100) : 0;
        return `
        <tr>
            <td>${p.name}</td>
            <td>${p.client}</td>
            <td>${p.address}</td>
            <td><div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div> ${progress}%</td>
            <td>${formatMoney(remaining)}</td>
        </tr>
    `}).join('') || '<tr><td colspan="5" style="text-align:center">پروژه فعالی نیست</td></tr>';
    
    // Simple bar chart
    drawSalesChart(data.sales);
}

function drawSalesChart(sales) {
    const canvas = $('salesChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const days = [];
    const jalaliDays = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
        days.push(`${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`);
        jalaliDays.push(`${jd}`);
    }
    const values = days.map(day => sales.filter(s => s.date === day).reduce((sum, s) => sum + s.total, 0));
    const max = Math.max(...values, 1);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const barWidth = 40;
    const gap = 15;
    const startX = 20;
    const bottomY = 170;
    
    values.forEach((v, i) => {
        const h = (v / max) * 140;
        const x = startX + i * (barWidth + gap);
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(x, bottomY - h, barWidth, h);
        ctx.fillStyle = '#475569';
        ctx.font = '11px Vazirmatn';
        ctx.fillText(jalaliDays[i], x + 10, bottomY + 15);
        if (v > 0) ctx.fillText((v/1000).toFixed(1) + 'k', x + 5, bottomY - h - 5);
    });
}

// ==================== INVENTORY ====================
function loadInventory() {
    const products = DB.getProducts();
    renderProducts(products);
}

function renderProducts(products) {
    $('productsTable').innerHTML = products.map(p => `
        <tr>
            <td>${p.id}</td>
            <td>${p.name}</td>
            <td>${formatMoney(p.buyPrice)}</td>
            <td>${formatMoney(p.sellPrice)}</td>
            <td><span class="badge badge-${p.stock < 10 ? 'danger' : p.stock < 30 ? 'warning' : 'success'}">${p.stock}</span></td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="editProduct(${p.id})">✏️</button>
                <button class="btn btn-sm btn-danger" onclick="deleteProduct(${p.id})">🗑️</button>
            </td>
        </tr>
    `).join('');
}

$('searchProduct').oninput = e => {
    const term = e.target.value.toLowerCase();
    renderProducts(DB.getProducts().filter(p => p.name.toLowerCase().includes(term)));
};

$('addProductBtn').onclick = () => {
    Modal.open('افزودن محصول', `
        <div class="form-group"><label>نام محصول</label><input type="text" id="pName" class="form-control"></div>

        <div class="form-group"><label>قیمت خرید (افغانی)</label><input type="number" id="pBuy" class="form-control"></div>
        <div class="form-group"><label>قیمت فروش (افغانی)</label><input type="number" id="pSell" class="form-control"></div>
        <div class="form-group"><label>موجودی اولیه</label><input type="number" id="pStock" class="form-control" value="0"></div>
    `, '<button class="btn btn-primary" onclick="saveProduct()">ذخیره</button>');
};

function saveProduct() {
    const name = $('pName').value.trim();
    if (!name) return alert('نام محصول الزامی است');
    const buyPrice = Number($('pBuy').value) || 0;
    const sellPrice = Number($('pSell').value) || 0;
    const addStock = Number($('pStock').value) || 0;

    // Check if product with same name + buyPrice + sellPrice already exists
    const existing = DB.getProducts().find(p => p.name === name && p.buyPrice === buyPrice && p.sellPrice === sellPrice);
    if (existing) {
        // Add to existing product's stock
        DB.updateProduct(existing.id, { stock: existing.stock + addStock });
        CloudSync._showSyncNotification(`✅ «${name}» به محصول موجود اضافه شد (موجودی: ${existing.stock + addStock})`);
    } else {
        // Create new product
        DB.addProduct({
            name,
            buyPrice, sellPrice, stock: addStock
        });
        CloudSync._showSyncNotification(`✅ محصول جدید «${name}» ثبت شد`);
    }
    Modal.close();
    loadInventory();
}

function editProduct(id) {
    const p = DB.getProduct(id);
    Modal.open('ویرایش محصول', `
        <div class="form-group"><label>نام محصول</label><input type="text" id="pName" class="form-control" value="${p.name}"></div>
        <div class="form-group"><label>قیمت خرید</label><input type="number" id="pBuy" class="form-control" value="${p.buyPrice}"></div>
        <div class="form-group"><label>قیمت فروش</label><input type="number" id="pSell" class="form-control" value="${p.sellPrice}"></div>
        <div class="form-group"><label>موجودی</label><input type="number" id="pStock" class="form-control" value="${p.stock}"></div>
    `, `<button class="btn btn-primary" onclick="updateProduct(${id})">بروزرسانی</button>`);
}

function updateProduct(id) {
    DB.updateProduct(id, {
        name: $('pName').value,
        buyPrice: Number($('pBuy').value),
        sellPrice: Number($('pSell').value),
        stock: Number($('pStock').value)
    });
    Modal.close();
    loadInventory();
}

function deleteProduct(id) {
    if (confirm('آیا از حذف این محصول مطمئن هستید؟')) {
        DB.deleteProduct(id);
        loadInventory();
    }
}

// ==================== SALES ====================
let saleItems = [];

function loadSales() {
    const sales = DB.getSales().reverse();
    renderSales(sales);
}

function renderSales(sales) {
    $('salesTable').innerHTML = sales.map(s => `
        <tr>
            <td>#${s.id}</td>
            <td>${s.customer}</td>
            <td>${toPersianDate(s.date)}</td>
            <td>${formatMoney(s.subtotal)}</td>
            <td>${formatMoney(s.discount)}</td>
            <td><strong>${formatMoney(s.total)}</strong></td>
            <td>${formatMoney(s.paid)}</td>
            <td><span class="badge badge-${s.debt > 0 ? 'danger' : 'success'}">${formatMoney(s.debt)}</span></td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="viewSale(${s.id})">👁️</button>
                <button class="btn btn-sm btn-danger" onclick="deleteSale(${s.id})">🗑️</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="9" style="text-align:center">فاکتوری ثبت نشده</td></tr>';
}

$('searchSale').oninput = e => {
    const term = e.target.value.toLowerCase();
    renderSales(DB.getSales().filter(s => s.customer.toLowerCase().includes(term)).reverse());
};

$('newSaleBtn').onclick = () => {
    saleItems = [];
    const products = DB.getProducts().filter(p => p.stock > 0);
    Modal.open('فاکتور فروش جدید', `
        <div class="form-group"><label>نام مشتری</label><input type="text" id="sCustomer" class="form-control"></div>
        <div class="form-group"><label>شماره تماس</label><input type="text" id="sPhone" class="form-control"></div>
        <div class="form-group"><label>تاریخ (شمسی)</label><input type="text" id="sDate" class="form-control" placeholder="1403-05-01" value="${todayJalali()}"></div>
        <div class="invoice-items">
            <div class="form-group"><label>افزودن کالا</label>
                <select id="sProduct" class="form-control" onchange="updateSalePrice()">
                    <option value="">انتخاب محصول</option>
                    ${products.map(p => `<option value="${p.id}" data-price="${p.sellPrice}">${p.name} (خرید: ${formatMoney(p.buyPrice)} - موجودی: ${p.stock})</option>`).join('')}
                </select>
            </div>
            <div style="display:flex;gap:10px">
                <input type="number" id="sQty" class="form-control" placeholder="تعداد" value="1" min="1">
                <button class="btn btn-success" onclick="addSaleItem()">+ اضافه</button>
            </div>
            <div id="saleItemsList" style="margin-top:15px"></div>
        </div>
        <div class="form-group"><label>تخفیف (افغانی)</label><input type="number" id="sDiscount" class="form-control" value="0" oninput="calcSaleTotal()"></div>
        <div class="form-group"><label>مبلغ پرداخت‌شده (افغانی)</label><input type="number" id="sPaid" class="form-control" value="0" oninput="calcSaleTotal()"></div>
        <div class="invoice-total">قابل پرداخت: <span id="sTotal">0</span> افغانی</div>
        <div class="invoice-total" style="color:#dc2626">باقی‌مانده: <span id="sDebt">0</span> افغانی</div>
    `, '<button class="btn btn-primary" onclick="saveSale()">ثبت فاکتور</button>');
};

function updateSalePrice() {
    // auto-fill if needed
}

function addSaleItem() {
    const pid = Number($('sProduct').value);
    const qty = Number($('sQty').value);
    if (!pid || qty < 1) return alert('محصول و تعداد را مشخص کنید');
    const p = DB.getProduct(pid);
    if (!p || p.stock < qty) return alert('موجودی کافی نیست');
    
    const existing = saleItems.find(i => i.productId === pid);
    if (existing) {
        existing.qty += qty;
    } else {
        saleItems.push({ productId: pid, name: p.name, price: p.sellPrice, qty });
    }
    renderSaleItems();
}

function renderSaleItems() {
    $('saleItemsList').innerHTML = saleItems.map((item, i) => `
        <div class="invoice-item">
            <span>${item.name}</span>
            <span>${item.qty} عدد</span>
            <span>${formatMoney(item.price)}</span>
            <span>${formatMoney(item.price * item.qty)}</span>
            <button class="btn btn-sm btn-danger" onclick="removeSaleItem(${i})">×</button>
        </div>
    `).join('');
    calcSaleTotal();
}

function removeSaleItem(idx) {
    saleItems.splice(idx, 1);
    renderSaleItems();
}

function calcSaleTotal() {
    const subtotal = saleItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const discount = Number($('sDiscount')?.value || 0);
    const total = subtotal - discount;
    if ($('sTotal')) $('sTotal').textContent = total.toLocaleString('fa-AF');
    const paid = Number($('sPaid')?.value || 0);
    const debt = total - paid;
    if ($('sDebt')) $('sDebt').textContent = (debt > 0 ? debt : 0).toLocaleString('fa-AF');
}

function saveSale() {
    const customer = $('sCustomer').value;
    if (!customer) return alert('نام مشتری الزامی است');
    if (saleItems.length === 0) return alert('حداقل یک کالا اضافه کنید');
    const subtotal = saleItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const discount = Number($('sDiscount').value) || 0;
    const total = subtotal - discount;
    const paid = Number($('sPaid').value) || 0;
    if (paid < 0 || paid > total) return alert('مبلغ پرداخت‌شده نامعتبر است');
    const debt = total - paid;
    DB.addSale({
        customer,
        phone: $('sPhone').value,
        date: $('sDate').value,
        items: saleItems,
        subtotal,
        discount,
        total,
        paid,
        debt: debt > 0 ? debt : 0
    });
    Modal.close();
    loadSales();
    loadDashboard();
    loadDebtors();
}

function viewSale(id) {
    const s = DB.getSales().find(x => x.id === id);
    if (!s) return;
    const shopName = 'لوازم برق و صنعت فانوس';
    const itemsRows = s.items.map(i => `
        <tr>
            <td>${i.name}</td>
            <td style="text-align:center">${i.qty}</td>
            <td style="text-align:left">${formatMoney(i.price)}</td>
            <td style="text-align:left">${formatMoney(i.price * i.qty)}</td>
        </tr>
    `).join('');

    Modal.open(`فاکتور #${id}`, `
        <div class="invoice-box" dir="rtl">
            <div class="invoice-header" style="text-align:center;border-bottom:2px solid #1e40af;padding-bottom:1rem;margin-bottom:1rem;">
                <h2 style="margin:0;color:#1e40af">${shopName}</h2>
                <p style="margin:0.25rem 0 0;font-size:13px;color:#64748b">فاکتور فروش کالا و خدمات</p>
            </div>
            <div class="invoice-meta" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:1rem;font-size:13px;margin-bottom:1rem;">
                <div><strong>شماره فاکتور:</strong> #${s.id}</div>
                <div><strong>تاریخ:</strong> ${toPersianDate(s.date)}</div>
            </div>
            <div class="invoice-customer" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:0.75rem 1rem;margin-bottom:1rem;font-size:13px;">
                <div><strong>نام مشتری:</strong> ${s.customer}</div>
                <div><strong>شماره تماس:</strong> ${s.phone || '-'}</div>
            </div>
            <table class="table invoice-table" style="margin-bottom:1rem;font-size:13px;">
                <thead>
                    <tr style="background:#1e40af;color:#fff">
                        <th>شرح کالا / خدمات</th>
                        <th style="text-align:center;width:70px">تعداد</th>
                        <th style="text-align:left;width:120px">قیمت واحد</th>
                        <th style="text-align:left;width:120px">جمع</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsRows}
                </tbody>
            </table>
            <div class="invoice-summary" style="width:280px;margin-right:auto;margin-left:0;border-top:2px solid #e2e8f0;padding-top:0.75rem;font-size:13px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:0.35rem"><span>جمع کل:</span><span>${formatMoney(s.subtotal)}</span></div>
                <div style="display:flex;justify-content:space-between;margin-bottom:0.35rem"><span>تخفیف:</span><span>${formatMoney(s.discount)}</span></div>
                <div style="display:flex;justify-content:space-between;margin-bottom:0.35rem;font-weight:700;font-size:15px;color:#1e40af"><span>قابل پرداخت:</span><span>${formatMoney(s.total)}</span></div>
                <div style="display:flex;justify-content:space-between;margin-bottom:0.35rem"><span>پرداخت‌شده:</span><span>${formatMoney(s.paid)}</span></div>
                <div style="display:flex;justify-content:space-between;color:#dc2626;font-weight:700"><span>باقی‌مانده:</span><span>${formatMoney(s.debt)}</span></div>
            </div>
            <div class="invoice-footer" style="margin-top:2rem;display:flex;justify-content:space-between;font-size:12px;color:#64748b;border-top:1px dashed #cbd5e1;padding-top:1rem;">
                <div>امضای فروشنده: _______________</div>
                <div>امضای مشتری: _______________</div>
            </div>
            <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:1rem">با تشکر از خرید شما</p>
        </div>
    `, '<button class="btn btn-secondary no-print" onclick="window.print()">🖨️ پرینت فاکتور</button>');
}

function deleteSale(id) {
    if (confirm('حذف شود؟')) { DB.deleteSale(id); loadSales(); loadFinance(); loadDashboard(); loadDebtors(); }
}

// ==================== REPAIRS ====================
function loadRepairs() {
    renderRepairs(DB.getRepairs().reverse());
}

function renderRepairs(repairs) {
    $('repairsTable').innerHTML = repairs.map(r => {
        const remainingClass = r.remaining > 0 ? 'text-danger' : 'text-success';
        return `
        <tr>
            <td>#${r.id}</td>
            <td>${r.customer}</td>
            <td>${r.device}</td>
            <td>${r.issue}</td>
            <td>${toPersianDate(r.receiveDate)}</td>
            <td><span class="badge badge-${r.status === 'تکمیل‌شده' || r.status === 'تحویل‌داده‌شده' ? 'success' : r.status === 'در حال تعمیر' ? 'warning' : 'info'}">${r.status}</span></td>
            <td>${formatMoney(r.cost)}</td>
            <td>${formatMoney(r.paid)}</td>
            <td class="${remainingClass}">${formatMoney(r.remaining)}</td>
            <td>
                ${r.remaining > 0 ? `<button class="btn btn-sm btn-success" onclick="payRepairModal(${r.id})">💰</button>` : ''}
                <button class="btn btn-sm btn-primary" onclick="editRepair(${r.id})">✏️</button>
                <button class="btn btn-sm btn-danger" onclick="deleteRepair(${r.id})">🗑️</button>
            </td>
        </tr>
    `}).join('') || '<tr><td colspan="9" style="text-align:center">تعمیراتی ثبت نشده</td></tr>';
}

$('searchRepair').oninput = e => {
    const term = e.target.value.toLowerCase();
    renderRepairs(DB.getRepairs().filter(r => r.customer.toLowerCase().includes(term) || r.device.includes(term)).reverse());
};

$('newRepairBtn').onclick = () => {
    Modal.open('ثبت تعمیر جدید', `
        <div class="form-group"><label>نام مشتری</label><input type="text" id="rCustomer" class="form-control"></div>
        <div class="form-group"><label>دستگاه</label><input type="text" id="rDevice" class="form-control"></div>
        <div class="form-group"><label>مشکل/توضیحات</label><textarea id="rIssue" class="form-control"></textarea></div>
        <div class="form-group"><label>تاریخ دریافت (شمسی)</label><input type="text" id="rDate" class="form-control" placeholder="1403-05-01" value="${todayJalali()}"></div>
        <div class="form-group"><label>شماره تماس</label><input type="text" id="rPhone" class="form-control"></div>
        <div class="form-group"><label>وضعیت</label><select id="rStatus" class="form-control"><option>دریافت‌شده</option><option>در حال تعمیر</option><option>تکمیل‌شده</option><option>تحویل‌داده‌شده</option></select></div>
        <div class="form-group"><label>هزینه تعمیر (افغانی)</label><input type="number" id="rCost" class="form-control" value="0"></div>
    `, '<button class="btn btn-primary" onclick="saveRepair()">ثبت</button>');
};

function saveRepair() {
    const customer = $('rCustomer').value;
    if (!customer) return alert('نام مشتری الزامی است');
    const cost = Number($('rCost').value) || 0;
    DB.addRepair({
        customer, device: $('rDevice').value,
        issue: $('rIssue').value,
        receiveDate: $('rDate').value,
        phone: $('rPhone').value,
        status: $('rStatus').value,
        cost: cost,
        paid: 0,
        remaining: cost
    });
    Modal.close();
    loadRepairs();
    loadFinance();
    loadDashboard();
}

function editRepair(id) {
    const r = DB.getRepairs().find(x => x.id === id);
    Modal.open('ویرایش تعمیر', `
        <div class="form-group"><label>نام مشتری</label><input type="text" id="rCustomer" class="form-control" value="${r.customer}"></div>
        <div class="form-group"><label>دستگاه</label><input type="text" id="rDevice" class="form-control" value="${r.device}"></div>
        <div class="form-group"><label>مشکل</label><textarea id="rIssue" class="form-control">${r.issue}</textarea></div>
        <div class="form-group"><label>وضعیت</label><select id="rStatus" class="form-control">
            <option ${r.status === 'دریافت‌شده' ? 'selected' : ''}>دریافت‌شده</option>
            <option ${r.status === 'در حال تعمیر' ? 'selected' : ''}>در حال تعمیر</option>
            <option ${r.status === 'تکمیل‌شده' ? 'selected' : ''}>تکمیل‌شده</option>
            <option ${r.status === 'تحویل‌داده‌شده' ? 'selected' : ''}>تحویل‌داده‌شده</option>
        </select></div>
        <div class="form-group"><label>هزینه</label><input type="number" id="rCost" class="form-control" value="${r.cost}"></div>
        <div class="form-group"><label>پرداخت‌شده</label><input type="number" id="rPaid" class="form-control" value="${r.paid || 0}"></div>
        <div class="form-group"><label>باقی‌مانده</label><input type="number" id="rRemaining" class="form-control" value="${r.remaining || 0}" readonly></div>
    `, `<button class="btn btn-primary" onclick="updateRepair(${id})">بروزرسانی</button>`);
}

function updateRepair(id) {
    DB.updateRepair(id, {
        customer: $('rCustomer').value,
        device: $('rDevice').value,
        issue: $('rIssue').value,
        status: $('rStatus').value,
        cost: Number($('rCost').value) || 0,
        paid: Number($('rPaid').value) || 0
    });
    Modal.close();
    loadRepairs();
    loadFinance();
    loadDashboard();
}

function payRepairModal(id) {
    const r = DB.getRepairs().find(x => x.id === id);
    Modal.open('پرداخت تعمیر', `
        <div class="form-group"><label>نام مشتری</label><input type="text" class="form-control" value="${r.customer}" readonly></div>
        <div class="form-group"><label>دستگاه</label><input type="text" class="form-control" value="${r.device}" readonly></div>
        <div class="form-group"><label>هزینه کل</label><input type="number" class="form-control" value="${r.cost}" readonly></div>
        <div class="form-group"><label>پرداخت‌شده</label><input type="number" class="form-control" value="${r.paid}" readonly></div>
        <div class="form-group"><label>باقی‌مانده</label><input type="number" class="form-control" value="${r.remaining}" readonly></div>
        <div class="form-group"><label>مبلغ پرداخت (افغانی)</label><input type="number" id="rpAmount" class="form-control" value="${r.remaining}"></div>
    `, `<button class="btn btn-success" onclick="submitRepairPayment(${id})">💰 ثبت پرداخت</button>`);
}

function submitRepairPayment(id) {
    const amount = Number($('rpAmount').value) || 0;
    if (amount <= 0) return alert('مبلغ نامعتبر');
    const r = DB.getRepairs().find(x => x.id === id);
    if (amount > r.remaining) return alert('مبلغ بیشتر از باقی‌مانده است');
    DB.payRepair(id, amount);
    Modal.close();
    loadRepairs();
    loadFinance();
    loadDashboard();
}

function deleteRepair(id) {
    if (confirm('حذف شود؟')) { DB.deleteRepair(id); loadRepairs(); loadFinance(); loadDashboard(); }
}

// ==================== PROJECTS ====================
function loadProjects() {
    renderProjects(DB.getProjects().reverse());
}

function renderProjects(projects) {
    $('projectsTable').innerHTML = projects.map(p => {
        const remaining = p.amount - p.paid;
        const progress = p.amount > 0 ? Math.round((p.paid / p.amount) * 100) : 0;
        return `
        <tr>
            <td>#${p.id}</td>
            <td>${p.name}</td>
            <td>${p.client}</td>
            <td>${p.address}</td>
            <td>${toPersianDate(p.startDate)}</td>
            <td>${formatMoney(p.amount)}</td>
            <td>${formatMoney(p.paid)}</td>
            <td><span class="badge badge-${p.status === 'تکمیل‌شده' ? 'success' : p.status === 'در حال اجرا' ? 'warning' : 'info'}">${p.status}</span></td>
            <td>
                <button class="btn btn-sm btn-info" onclick="viewProject(${p.id})">👁️ جزئیات</button>
                ${p.paid >= p.amount ? '<span class="badge badge-success">تسویه شده</span>' : `<button class="btn btn-sm btn-success" onclick="addPaymentProject(${p.id})">💰 پرداخت</button>`}
                <button class="btn btn-sm btn-primary" onclick="editProject(${p.id})">✏️</button>
                <button class="btn btn-sm btn-danger" onclick="deleteProject(${p.id})">🗑️</button>
            </td>
        </tr>
    `}).join('') || '<tr><td colspan="9" style="text-align:center">پروژه‌ای ثبت نشده</td></tr>';
}

$('searchProject').oninput = e => {
    const term = e.target.value.toLowerCase();
    renderProjects(DB.getProjects().filter(p => p.name.toLowerCase().includes(term) || p.client.toLowerCase().includes(term)).reverse());
};

$('newProjectBtn').onclick = () => {
    Modal.open('پروژه جدید', `
        <div class="form-group"><label>نام پروژه</label><input type="text" id="prName" class="form-control"></div>
        <div class="form-group"><label>مشتری/شرکت</label><input type="text" id="prClient" class="form-control"></div>
        <div class="form-group"><label>آدرس</label><input type="text" id="prAddress" class="form-control"></div>
        <div class="form-group"><label>مبلغ قرارداد (افغانی)</label><input type="number" id="prAmount" class="form-control" value="0"></div>
        <div class="form-group"><label>پیش‌پرداخت (افغانی)</label><input type="number" id="prPaid" class="form-control" value="0"></div>
        <div class="form-group"><label>تاریخ شروع (شمسی)</label><input type="text" id="prStartDate" class="form-control" placeholder="1403-05-01" value="${todayJalali()}"></div>
        <div class="form-group"><label>وضعیت</label><select id="prStatus" class="form-control"><option>شروع نشده</option><option>در حال اجرا</option><option>تکمیل‌شده</option></select></div>
        <div class="form-group"><label>توضیحات</label><textarea id="prDesc" class="form-control"></textarea></div>
    `, '<button class="btn btn-primary" onclick="saveProject()">ذخیره</button>');
};

function saveProject() {
    const name = $('prName').value;
    const paid = Number($('prPaid').value) || 0;
    if (!name) return alert('نام پروژه الزامی است');
    const project = DB.addProject({
        name, client: $('prClient').value,
        address: $('prAddress').value,
        amount: Number($('prAmount').value) || 0,
        paid: paid,
        status: $('prStatus').value,
        startDate: $('prStartDate').value,
        description: $('prDesc').value
    });
    if (paid > 0) {
        DB.addTransaction({
            type: 'income',
            description: `پیش‌پرداخت پروژه: ${name}`,
            amount: paid,
            category: 'پروژه',
            date: todayJalali(),
            refType: 'project',
            refId: project.id
        });
    }
    Modal.close();
    loadProjects();
    loadFinance();
    loadDashboard();
}

function editProject(id) {
    const p = DB.getProjects().find(x => x.id === id);
    Modal.open('ویرایش پروژه', `
        <div class="form-group"><label>نام پروژه</label><input type="text" id="prName" class="form-control" value="${p.name}"></div>
        <div class="form-group"><label>مشتری</label><input type="text" id="prClient" class="form-control" value="${p.client}"></div>
        <div class="form-group"><label>آدرس</label><input type="text" id="prAddress" class="form-control" value="${p.address}"></div>
        <div class="form-group"><label>مبلغ قرارداد</label><input type="number" id="prAmount" class="form-control" value="${p.amount}"></div>
        <div class="form-group"><label>وضعیت</label><select id="prStatus" class="form-control">
            <option ${p.status === 'شروع نشده' ? 'selected' : ''}>شروع نشده</option>
            <option ${p.status === 'در حال اجرا' ? 'selected' : ''}>در حال اجرا</option>
            <option ${p.status === 'تکمیل‌شده' ? 'selected' : ''}>تکمیل‌شده</option>
        </select></div>
    `, `<button class="btn btn-primary" onclick="updateProject(${id})">بروزرسانی</button>`);
}

function updateProject(id) {
    DB.updateProject(id, {
        name: $('prName').value,
        client: $('prClient').value,
        address: $('prAddress').value,
        amount: Number($('prAmount').value) || 0,
        status: $('prStatus').value
    });
    Modal.close();
    loadProjects();
    loadDashboard();
}

function addPaymentProject(id) {
    const p = DB.getProjects().find(x => x.id === id);
    if (!p) return;
    if (p.paid >= p.amount) return alert('این پروژه قبلاً تسویه شده است.');
    Modal.open('ثبت پرداخت جدید', `
        <p>پروژه: ${p.name}</p>
        <p>باقیمانده: ${formatMoney(p.amount - p.paid)}</p>
        <div class="form-group"><label>مبلغ پرداخت (افغانی)</label><input type="number" id="payAmount" class="form-control"></div>
        <div class="form-group"><label>تاریخ (شمسی)</label><input type="text" id="payDate" class="form-control" placeholder="1403-05-01" value="${todayJalali()}"></div>
    `, `<button class="btn btn-success" onclick="saveProjectPayment(${id})">ثبت پرداخت</button>`);
}

function saveProjectPayment(id) {
    const amount = Number($('payAmount').value) || 0;
    if (amount <= 0) return alert('مبلغ نامعتبر');
    const p = DB.getProjects().find(x => x.id === id);
    DB.updateProject(id, { paid: p.paid + amount });
    DB.addTransaction({
        type: 'income',
        description: `پرداخت پروژه: ${p.name}`,
        amount,
        category: 'پروژه',
        date: $('payDate').value,
        refType: 'project',
        refId: id
    });
    Modal.close();
    loadProjects();
    loadFinance();
}

function deleteProject(id) {
    if (confirm('حذف شود؟')) { DB.deleteProject(id); loadProjects(); loadFinance(); loadDashboard(); }
}

function viewProject(id) {
    const p = DB.getProjects().find(x => x.id === id);
    if (!p) return;
    const remaining = p.amount - p.paid;
    const progress = p.amount > 0 ? Math.round((p.paid / p.amount) * 100) : 0;
    const transactions = DB.getTransactions().filter(t => t.refType === 'project' && t.refId === id).reverse();
    let txRows = transactions.map(t => `
        <tr>
            <td style="padding:4px 8px; font-size:13px;">${t.date || '-'}</td>
            <td style="padding:4px 8px; font-size:13px;">${t.description}</td>
            <td style="padding:4px 8px; font-size:13px; text-align:left; direction:ltr;">${formatMoney(t.amount)}</td>
        </tr>
    `).join('') || '<tr><td colspan="3" style="text-align:center; padding:8px; font-size:13px; color:#666;">تراکنشی ثبت نشده</td></tr>';

    Modal.open('جزئیات پروژه', `
        <div class="print-section" style="font-family: Vazirmatn, Tahoma, sans-serif; line-height:1.5; font-size:13px; color:#1e293b;">
            <!-- Header -->
            <div style="text-align:center; margin-bottom:12px; border-bottom:2px solid #0f766e; padding-bottom:8px;">
                <h2 style="margin:0; color:#0f766e; font-size:20px; font-weight:700;">${DB.getAll().shop.name || 'دکان لوازم برقی'}</h2>
                <p style="margin:3px 0 0; font-size:12px; color:#555;">گزارش جزئیات پروژه</p>
            </div>

            <!-- Info Table -->
            <table style="width:100%; border-collapse:collapse; margin-bottom:12px; font-size:13px;">
                <tr>
                    <td style="padding:5px 8px; border:1px solid #cbd5e1; background:#f8fafc; font-weight:600; width:25%; color:#334155;">نام پروژه</td>
                    <td style="padding:5px 8px; border:1px solid #cbd5e1; width:25%;">${p.name}</td>
                    <td style="padding:5px 8px; border:1px solid #cbd5e1; background:#f8fafc; font-weight:600; width:25%; color:#334155;">مشتری / شرکت</td>
                    <td style="padding:5px 8px; border:1px solid #cbd5e1; width:25%;">${p.client || '-'}</td>
                </tr>
                <tr>
                    <td style="padding:5px 8px; border:1px solid #cbd5e1; background:#f8fafc; font-weight:600; color:#334155;">آدرس</td>
                    <td style="padding:5px 8px; border:1px solid #cbd5e1;" colspan="3">${p.address || '-'}</td>
                </tr>
                <tr>
                    <td style="padding:5px 8px; border:1px solid #cbd5e1; background:#f8fafc; font-weight:600; color:#334155;">تاریخ شروع</td>
                    <td style="padding:5px 8px; border:1px solid #cbd5e1;">${toPersianDate(p.startDate)}</td>
                    <td style="padding:5px 8px; border:1px solid #cbd5e1; background:#f8fafc; font-weight:600; color:#334155;">وضعیت</td>
                    <td style="padding:5px 8px; border:1px solid #cbd5e1;"><span class="badge badge-${p.status === 'تکمیل‌شده' ? 'success' : p.status === 'در حال اجرا' ? 'warning' : 'info'}">${p.status}</span></td>
                </tr>
            </table>

            <!-- Financial Summary -->
            <table style="width:100%; border-collapse:collapse; margin-bottom:12px; font-size:13px;">
                <tr>
                    <td style="padding:5px 8px; border:1px solid #cbd5e1; background:#f0fdfa; font-weight:600; color:#0f766e; width:33%;">مبلغ قرارداد</td>
                    <td style="padding:5px 8px; border:1px solid #cbd5e1; background:#f0fdf4; font-weight:600; color:#047857; width:33%;">پرداخت‌شده</td>
                    <td style="padding:5px 8px; border:1px solid #cbd5e1; background:${remaining > 0 ? '#fef2f2' : '#f0fdf4'}; font-weight:600; color:${remaining > 0 ? '#b91c1c' : '#047857'}; width:34%;">باقی‌مانده</td>
                </tr>
                <tr>
                    <td style="padding:5px 8px; border:1px solid #cbd5e1; text-align:center; font-size:15px; font-weight:700; color:#0f766e;">${formatMoney(p.amount)}</td>
                    <td style="padding:5px 8px; border:1px solid #cbd5e1; text-align:center; font-size:15px; font-weight:700; color:#047857;">${formatMoney(p.paid)}</td>
                    <td style="padding:5px 8px; border:1px solid #cbd5e1; text-align:center; font-size:15px; font-weight:700; color:${remaining > 0 ? '#b91c1c' : '#047857'};">${formatMoney(remaining)}</td>
                </tr>
            </table>

            <!-- Progress Bar -->
            <div style="margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:3px; color:#475569;">
                    <span>پیشرفت پرداخت</span>
                    <span>${progress}%</span>
                </div>
                <div style="background:#e2e8f0; border-radius:4px; height:14px; overflow:hidden;">
                    <div style="width:${progress}%; background:linear-gradient(90deg,#0f766e,#14b8a6); height:100%; border-radius:4px;"></div>
                </div>
            </div>

            <!-- Description -->
            ${p.description ? `<div style="padding:6px 10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; margin-bottom:12px; font-size:12px; color:#475569;"><strong>توضیحات:</strong> ${p.description}</div>` : ''}

            <!-- Payment History -->
            <div style="font-size:14px; font-weight:700; color:#0f766e; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:6px;">تاریخچه پرداخت‌ها</div>
            <table style="width:100%; border-collapse:collapse; margin-bottom:10px; font-size:13px;">
                <thead>
                    <tr style="background:#f1f5f9;">
                        <th style="padding:5px 8px; border:1px solid #cbd5e1; font-size:12px; color:#334155; text-align:right; width:22%;">تاریخ</th>
                        <th style="padding:5px 8px; border:1px solid #cbd5e1; font-size:12px; color:#334155; text-align:right; width:53%;">شرح</th>
                        <th style="padding:5px 8px; border:1px solid #cbd5e1; font-size:12px; color:#334155; text-align:left; direction:ltr; width:25%;">مبلغ (افغانی)</th>
                    </tr>
                </thead>
                <tbody>${txRows}</tbody>
            </table>

            <!-- Footer -->
            <div style="text-align:center; font-size:11px; color:#64748b; border-top:1px solid #e2e8f0; padding-top:6px;">
                چاپ‌شده در ${todayJalali()}
            </div>
        </div>
    `, `<button class="btn btn-primary no-print" onclick="window.print()">🖨️ پرینت</button>`);
}

// ==================== EMPLOYEES ====================
function loadEmployees() {
    renderEmployees(DB.getEmployees());
}

$('searchEmployee').oninput = e => {
    const q = e.target.value.toLowerCase();
    const all = DB.getEmployees();
    const filtered = all.filter(emp => emp.name.toLowerCase().includes(q) || emp.role.toLowerCase().includes(q) || (emp.phone || '').includes(q));
    renderEmployees(filtered);
};

function renderEmployees(list) {
    $('employeesTable').innerHTML = list.map(e => `
        <tr>
            <td>#${e.id}</td>
            <td>${e.name}</td>
            <td><span class="badge badge-info">${e.role}</span></td>
            <td>${e.phone}</td>
            <td>${formatMoney(e.salary)}</td>
            <td>${formatMoney(e.paid)}</td>
            <td><span class="badge badge-${e.debt > 0 ? 'danger' : 'success'}">${formatMoney(e.debt)}</span></td>
            <td>
                <button class="btn btn-sm btn-success" onclick="payEmployee(${e.id})">💰 پرداخت</button>
                <button class="btn btn-sm btn-primary" onclick="editEmployee(${e.id})">✏️</button>
                <button class="btn btn-sm btn-danger" onclick="deleteEmployee(${e.id})">🗑️</button>
            </td>
        </tr>
    `).join('');
}

$('addEmployeeBtn').onclick = () => {
    Modal.open('افزودن شخص', `
        <div class="form-group"><label>نام</label><input type="text" id="eName" class="form-control"></div>
        <div class="form-group"><label>نقش</label><select id="eRole" class="form-control"><option>شریک</option><option>کارگر</option><option>کارمند</option><option>پیمانکار</option></select></div>
        <div class="form-group"><label>شماره تماس</label><input type="text" id="ePhone" class="form-control"></div>
        <div class="form-group"><label>حقوق/سهم ماهانه (افغانی)</label><input type="number" id="eSalary" class="form-control" value="0"></div>
    `, '<button class="btn btn-primary" onclick="saveEmployee()">ذخیره</button>');
};

function saveEmployee() {
    const name = $('eName').value;
    if (!name) return alert('نام الزامی است');
    DB.addEmployee({
        name, role: $('eRole').value,
        phone: $('ePhone').value,
        salary: Number($('eSalary').value) || 0
    });
    Modal.close();
    loadEmployees();
}

function editEmployee(id) {
    const e = DB.getEmployees().find(x => x.id === id);
    Modal.open('ویرایش شخص', `
        <div class="form-group"><label>نام</label><input type="text" id="eName" class="form-control" value="${e.name}"></div>
        <div class="form-group"><label>نقش</label><select id="eRole" class="form-control">
            <option ${e.role === 'شریک' ? 'selected' : ''}>شریک</option>
            <option ${e.role === 'کارگر' ? 'selected' : ''}>کارگر</option>
            <option ${e.role === 'کارمند' ? 'selected' : ''}>کارمند</option>
            <option ${e.role === 'پیمانکار' ? 'selected' : ''}>پیمانکار</option>
        </select></div>
        <div class="form-group"><label>شماره تماس</label><input type="text" id="ePhone" class="form-control" value="${e.phone}"></div>
        <div class="form-group"><label>حقوق/سهم ماهانه</label><input type="number" id="eSalary" class="form-control" value="${e.salary}"></div>
    `, `<button class="btn btn-primary" onclick="updateEmployee(${id})">بروزرسانی</button>`);
}

function updateEmployee(id) {
    DB.updateEmployee(id, {
        name: $('eName').value,
        role: $('eRole').value,
        phone: $('ePhone').value,
        salary: Number($('eSalary').value) || 0
    });
    Modal.close();
    loadEmployees();
}

function payEmployee(id) {
    const emp = DB.getEmployees().find(x => x.id === id);
    Modal.open('پرداخت به ' + emp.name, `
        <p>حقوق ماهانه: ${formatMoney(emp.salary)}</p>
        <p>پرداخت‌شده تاکنون: ${formatMoney(emp.paid)}</p>
        <p>بدهکاری: ${formatMoney(emp.debt)}</p>
        <div class="form-group"><label>مبلغ پرداخت (افغانی)</label><input type="number" id="payAmt" class="form-control"></div>
        <div class="form-group"><label>تاریخ (شمسی)</label><input type="text" id="payDate" class="form-control" placeholder="1403-05-01" value="${todayJalali()}"></div>
    `, `<button class="btn btn-success" onclick="saveEmployeePayment(${id})">ثبت پرداخت</button>`);
}

function saveEmployeePayment(id) {
    const amount = Number($('payAmt').value) || 0;
    if (amount <= 0) return;
    const emp = DB.getEmployees().find(x => x.id === id);
    const newPaid = emp.paid + amount;
    const newDebt = emp.salary - newPaid;
    DB.updateEmployee(id, { paid: newPaid, debt: newDebt > 0 ? newDebt : 0 });
    DB.addTransaction({
        type: 'expense',
        description: `پرداخت به ${emp.name} (${emp.role})`,
        amount,
        category: 'حقوق و دستمزد',
        date: $('payDate').value,
        refType: 'employee',
        refId: id
    });
    Modal.close();
    loadEmployees();
    loadFinance();
}

function deleteEmployee(id) {
    if (confirm('حذف شود؟')) { DB.deleteEmployee(id); loadEmployees(); loadFinance(); }
}

// ==================== FINANCE ====================
function loadFinance() {
    const data = DB.getAll();
    const currentMonth = todayJalali().substring(0, 7);
    const monthTrans = data.transactions.filter(t => t.date.startsWith(currentMonth));
    const income = monthTrans.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = monthTrans.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const debtors = DB.getDebtors();
    const creditors = DB.getCreditors();
    const receivables = debtors.reduce((s, d) => s + (d.totalDebt || 0), 0);
    const payables = creditors.reduce((s, c) => s + (c.totalDebt || 0), 0);

    $('financeIncome').textContent = formatMoney(income);
    $('financeExpense').textContent = formatMoney(expense);
    $('financeProfit').textContent = formatMoney(income - expense);
    $('financeReceivables').textContent = formatMoney(receivables);
    $('financeMarketDebt').textContent = formatMoney(payables);

    allTransactions = [...data.transactions].reverse();
    renderTransactions(allTransactions);
}

$('searchTransaction').oninput = e => {
    const q = e.target.value.trim();
    const filtered = allTransactions.filter(t =>
        (t.description || '').includes(q) ||
        (t.date || '').includes(q) ||
        String(t.amount).includes(q) ||
        (t.type === 'income' ? 'درآمد' : 'هزینه').includes(q)
    );
    txPage = 1;
    renderTransactions(filtered);
};

function renderTransactions(list) {
    const total = list.length;
    const totalPages = Math.ceil(total / TX_PER_PAGE) || 1;
    if (txPage > totalPages) txPage = totalPages;
    if (txPage < 1) txPage = 1;
    const start = (txPage - 1) * TX_PER_PAGE;
    const pageItems = list.slice(start, start + TX_PER_PAGE);

    $('transactionsTable').innerHTML = pageItems.map(t => `
        <tr>
            <td>${toPersianDate(t.date)}</td>
            <td><span class="badge badge-${t.type === 'income' ? 'success' : 'danger'}">${t.type === 'income' ? 'درآمد' : 'هزینه'}</span></td>
            <td>${t.description}</td>
            <td>${formatMoney(t.amount)}</td>
            <td><button class="btn btn-sm btn-danger" onclick="deleteTransaction(${t.id})">🗑️</button></td>
        </tr>
    `).join('') || '<tr><td colspan="5" style="text-align:center">تراکنشی ثبت نشده</td></tr>';

    let paginationHtml = '';
    if (totalPages > 1) {
        paginationHtml += `<button class="btn btn-sm" ${txPage === 1 ? 'disabled style="opacity:0.5"' : ''} onclick="changeTxPage(${txPage - 1})">← قبلی</button>`;
        paginationHtml += `<span style="font-size:13px; color:#334155;">صفحه ${txPage} از ${totalPages}</span>`;
        paginationHtml += `<button class="btn btn-sm" ${txPage === totalPages ? 'disabled style="opacity:0.5"' : ''} onclick="changeTxPage(${txPage + 1})">بعدی →</button>`;
    }
    $('txPagination').innerHTML = paginationHtml;
}

function changeTxPage(newPage) {
    txPage = newPage;
    loadFinance();
}

$('addTransactionBtn').onclick = () => {
    Modal.open('ثبت تراکنش جدید', `
        <div class="form-group"><label>نوع</label><select id="tType" class="form-control"><option value="income">درآمد</option><option value="expense">هزینه</option></select></div>
        <div class="form-group"><label>شرح</label><input type="text" id="tDesc" class="form-control"></div>
        <div class="form-group"><label>مبلغ (افغانی)</label><input type="number" id="tAmount" class="form-control"></div>
        <div class="form-group"><label>تاریخ (شمسی)</label><input type="text" id="tDate" class="form-control" placeholder="1403-05-01" value="${todayJalali()}"></div>
    `, '<button class="btn btn-primary" onclick="saveTransaction()">ثبت</button>');
};

function saveTransaction() {
    const desc = $('tDesc').value;
    const amount = Number($('tAmount').value) || 0;
    if (!desc || amount <= 0) return alert('لطفاً همه فیلدها را پر کنید');
    DB.addTransaction({
        type: $('tType').value,
        description: desc,
        amount,
        date: $('tDate').value
    });
    Modal.close();
    txPage = 1;
    loadFinance();
    loadDashboard();
}

function deleteTransaction(id) {
    if (confirm('حذف شود؟')) { DB.deleteTransaction(id); txPage = 1; loadFinance(); }
}

// ==================== DEBTORS ====================
function loadDebtors() {
    const debtors = DB.getDebtors();
    const creditors = DB.getCreditors();
    renderDebtors(debtors);
    renderCreditors(creditors);

    // Summary cards
    const totalReceivable = debtors.reduce((sum, d) => sum + (d.totalDebt || 0), 0);
    const totalPayable = creditors.reduce((sum, c) => sum + (c.totalDebt || 0), 0);
    const netBalance = totalReceivable - totalPayable;

    $('accTotalReceivable').textContent = formatMoney(totalReceivable);
    $('accTotalPayable').textContent = formatMoney(totalPayable);
    $('accNetBalance').textContent = formatMoney(netBalance);

    // Market debt input now read-only (calculated from purchases)
    const mdInput = $('marketDebtInput');
    if (mdInput) mdInput.value = totalPayable;
}

function renderDebtors(debtors) {
    $('debtorsTable').innerHTML = debtors.map(d => `
        <tr>
            <td>#${d.id}</td>
            <td>${d.name}</td>
            <td>${d.phone || '-'}</td>
            <td><span class="badge badge-danger">${formatMoney(d.totalDebt)}</span></td>
            <td>${toPersianDate(d.lastDate)}</td>
            <td>
                <button class="btn btn-sm btn-success" onclick='payDebtor(${JSON.stringify(d.id)})'>💰 پرداخت</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="5" style="text-align:center">قرض‌داری ثبت نشده</td></tr>';
}

function renderCreditors(creditors) {
    $('creditorsTable').innerHTML = creditors.map(c => `
        <tr>
            <td>#${c.id}</td>
            <td>${c.name}</td>
            <td><span class="badge badge-danger">${formatMoney(c.totalDebt)}</span></td>
            <td>
                <button class="btn btn-sm btn-success" onclick='payCreditor(${JSON.stringify(c.id)})'>💰 پرداخت</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="4" style="text-align:center">بستانکاری ثبت نشده</td></tr>';
}

$('searchDebtor').oninput = e => {
    const term = e.target.value.toLowerCase();
    renderDebtors(DB.getDebtors().filter(d => d.name.toLowerCase().includes(term) || (d.phone || '').includes(term)));
};

function payDebtor(id) {
    const d = DB.getDebtors().find(x => x.id === id);
    if (!d) return;
    Modal.open('پرداخت بدهی: ' + d.name, `
        <p>بدهی کل: ${formatMoney(d.totalDebt)}</p>
        <div class="form-group"><label>مبلغ پرداخت (افغانی)</label><input type="number" id="debtPayAmt" class="form-control"></div>
        <div class="form-group"><label>تاریخ (شمسی)</label><input type="text" id="debtPayDate" class="form-control" placeholder="1403-05-01" value="${todayJalali()}"></div>
    `, `<button class="btn btn-success" onclick='saveDebtorPayment(${JSON.stringify(id)})'>ثبت پرداخت</button>`);
}

function saveDebtorPayment(id) {
    const amount = Number($('debtPayAmt').value) || 0;
    if (amount <= 0) return alert('مبلغ نامعتبر');
    const d = DB.getDebtors().find(x => x.id === id);
    if (!d) return;
    if (amount > d.totalDebt) return alert('مبلغ بیشتر از بدهی است');
    DB.payDebtor(id, amount);
    Modal.close();
    loadDebtors();
    loadFinance();
    loadDashboard();
}

function payCreditor(id) {
    const c = DB.getCreditors().find(x => x.id === id);
    if (!c) return;
    Modal.open('پرداخت بدهی به: ' + c.name, `
        <p>بدهی کل: ${formatMoney(c.totalDebt)}</p>
        <div class="form-group"><label>مبلغ پرداخت (افغانی)</label><input type="number" id="creditorPayAmt" class="form-control"></div>
        <div class="form-group"><label>تاریخ (شمسی)</label><input type="text" id="creditorPayDate" class="form-control" placeholder="1403-05-01" value="${todayJalali()}"></div>
    `, `<button class="btn btn-success" onclick='saveCreditorPayment(${JSON.stringify(id)})'>ثبت پرداخت</button>`);
}

function saveCreditorPayment(id) {
    const amount = Number($('creditorPayAmt').value) || 0;
    if (amount <= 0) return alert('مبلغ نامعتبر');
    const c = DB.getCreditors().find(x => x.id === id);
    if (!c) return;
    if (amount > c.totalDebt) return alert('مبلغ بیشتر از بدهی است');
    DB.payCreditor(id, amount);
    Modal.close();
    loadDebtors();
    loadFinance();
    loadDashboard();
}

function deleteDebtor(id) {
    if (confirm('قرض‌دار حذف شود؟')) {
        DB.deleteDebtor(id);
        loadDebtors();
    }
}

function saveMarketDebt() {
    // Market debt is now calculated dynamically from purchases
    alert('قروض بازار به‌صورت خودکار از خریداری‌ها محاسبه می‌شود.');
}

// ==================== PURCHASES ====================
let purchaseItems = [];

function loadPurchases() {
    renderPurchases(DB.getPurchases());
}

function renderPurchases(list) {
    $('purchasesTable').innerHTML = list.map(p => {
        const itemCount = (p.items || []).length;
        const firstItem = (p.items && p.items[0]) ? p.items[0].productName : (p.productName || '-');
        const itemLabel = itemCount > 1 ? `${firstItem} و ${itemCount - 1} مورد دیگر` : firstItem;
        return `
        <tr>
            <td>#${p.id}</td>
            <td>${itemLabel}</td>
            <td>${p.supplier || '-'}</td>
            <td>${toPersianDate(p.date)}</td>
            <td><strong>${formatMoney(p.total)}</strong></td>
            <td>${formatMoney(p.paid)}</td>
            <td><span class="badge badge-${p.remaining > 0 ? 'danger' : 'success'}">${formatMoney(p.remaining)}</span></td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="viewPurchase(${p.id})">👁️</button>
                <button class="btn btn-sm btn-success" onclick="payPurchase(${p.id})">💰</button>
                <button class="btn btn-sm btn-danger" onclick="deletePurchase(${p.id})">🗑️</button>
            </td>
        </tr>`;
    }).reverse().join('') || '<tr><td colspan="8" style="text-align:center">خریداری ثبت نشده</td></tr>';
}

$('addPurchaseBtn').onclick = () => {
    purchaseItems = [];
    const products = DB.getProducts();
    const options = products.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    Modal.open('خریداری جدید از بازار', `
        <div class="form-group"><label>فروشنده / تأمین‌کننده</label><input type="text" id="pSupplier" class="form-control"></div>
        <div class="form-group"><label>تاریخ (شمسی)</label><input type="text" id="pDate" class="form-control" placeholder="1403-05-01" value="${todayJalali()}"></div>
        <div class="form-group"><label>توضیحات</label><input type="text" id="pNotes" class="form-control"></div>
        <div class="invoice-items">
            <div class="form-group"><label>افزودن جنس</label>
                <input type="text" id="pName" class="form-control" list="pList" placeholder="نام جنس">
                <datalist id="pList">${options}</datalist>
            </div>
            <div style="display:flex;gap:10px">
                <input type="number" id="pQty" class="form-control" placeholder="تعداد" value="1" min="1" style="width:80px">
                <input type="number" id="pBuyPrice" class="form-control" placeholder="قیمت خرید واحد" value="0" style="width:120px">
                <input type="number" id="pSellPrice" class="form-control" placeholder="قیمت فروش واحد" value="0" style="width:120px">
                <button class="btn btn-success" onclick="addPurchaseItem()">+ اضافه</button>
            </div>
            <div id="purchaseItemsList" style="margin-top:15px"></div>
        </div>
        <div class="form-group"><label>پرداخت‌شده (افغانی)</label><input type="number" id="pPaid" class="form-control" value="0" oninput="calcPurchaseTotal()"></div>
        <div class="invoice-total">مبلغ کل: <span id="pTotal">0</span> افغانی</div>
        <div class="invoice-total" style="color:#dc2626">باقی‌مانده (قروض): <span id="pRemaining">0</span> افغانی</div>
    `, '<button class="btn btn-primary" onclick="savePurchase()">ثبت خریداری</button>');
};

function addPurchaseItem() {
    const productName = $('pName').value.trim();
    const qty = Number($('pQty').value) || 0;
    const unitPrice = Number($('pBuyPrice').value) || 0;
    const sellPrice = Number($('pSellPrice').value) || unitPrice;
    if (!productName || qty <= 0 || unitPrice <= 0) return alert('لطفاً نام جنس، تعداد و قیمت خرید را وارد کنید');

    const existing = purchaseItems.find(i => i.productName === productName && i.unitPrice === unitPrice);
    if (existing) {
        existing.qty += qty;
        if (sellPrice > 0) existing.sellPrice = sellPrice;
    } else {
        purchaseItems.push({ productName, qty, unitPrice, sellPrice, lineTotal: qty * unitPrice });
    }
    // Reset inputs for next item
    $('pName').value = '';
    $('pQty').value = '1';
    $('pBuyPrice').value = '0';
    $('pSellPrice').value = '0';
    renderPurchaseItems();
}

function renderPurchaseItems() {
    $('purchaseItemsList').innerHTML = purchaseItems.map((item, i) => `
        <div class="invoice-item">
            <span>${item.productName}</span>
            <span>${item.qty} عدد</span>
            <span>خرید: ${formatMoney(item.unitPrice)}</span>
            <span>فروش: ${formatMoney(item.sellPrice)}</span>
            <span><strong>${formatMoney(item.lineTotal)}</strong></span>
            <button class="btn btn-sm btn-danger" onclick="removePurchaseItem(${i})">×</button>
        </div>
    `).join('');
    calcPurchaseTotal();
}

function removePurchaseItem(idx) {
    purchaseItems.splice(idx, 1);
    renderPurchaseItems();
}

function calcPurchaseTotal() {
    const total = purchaseItems.reduce((sum, i) => sum + i.lineTotal, 0);
    if ($('pTotal')) $('pTotal').textContent = total.toLocaleString('fa-AF');
    const paid = Number($('pPaid')?.value || 0);
    const remaining = total - paid;
    if ($('pRemaining')) $('pRemaining').textContent = (remaining > 0 ? remaining : 0).toLocaleString('fa-AF');
}

function savePurchase() {
    if (purchaseItems.length === 0) return alert('حداقل یک جنس اضافه کنید');
    const total = purchaseItems.reduce((sum, i) => sum + i.lineTotal, 0);
    const paid = Number($('pPaid').value) || 0;
    if (paid < 0 || paid > total) return alert('مبلغ پرداخت‌شده نامعتبر است');

    DB.addPurchase({
        items: purchaseItems.map(i => ({ productName: i.productName, qty: i.qty, unitPrice: i.unitPrice, sellPrice: i.sellPrice, lineTotal: i.lineTotal })),
        total,
        paid,
        supplier: $('pSupplier').value,
        date: $('pDate').value,
        notes: $('pNotes').value
    });
    Modal.close();
    loadPurchases();
    loadInventory();
    loadFinance();
    loadDashboard();
}

function viewPurchase(id) {
    const p = DB.getPurchases().find(x => x.id === id);
    if (!p) return;
    const shopName = 'لوازم برق و صنعت فانوس';
    const items = p.items || [];
    const itemsRows = items.map(i => `
        <tr>
            <td>${i.productName}</td>
            <td style="text-align:center">${i.qty}</td>
            <td style="text-align:left">${formatMoney(i.unitPrice)}</td>
            <td style="text-align:left">${formatMoney(i.sellPrice)}</td>
            <td style="text-align:left"><strong>${formatMoney(i.lineTotal)}</strong></td>
        </tr>
    `).join('');

    Modal.open(`فاکتور خریداری #${id}`, `
        <div class="invoice-box" dir="rtl">
            <div class="invoice-header" style="text-align:center;border-bottom:2px solid #059669;padding-bottom:1rem;margin-bottom:1rem;">
                <h2 style="margin:0;color:#059669">${shopName}</h2>
                <p style="margin:0.25rem 0 0;font-size:13px;color:#64748b">فاکتور خریداری کالا</p>
            </div>
            <div class="invoice-meta" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:1rem;font-size:13px;margin-bottom:1rem;">
                <div><strong>شماره فاکتور:</strong> #${p.id}</div>
                <div><strong>تاریخ:</strong> ${toPersianDate(p.date)}</div>
            </div>
            <div class="invoice-supplier" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:0.75rem 1rem;margin-bottom:1rem;font-size:13px;">
                <div><strong>فروشنده / تأمین‌کننده:</strong> ${p.supplier || '-'}</div>
                ${p.notes ? `<div><strong>توضیحات:</strong> ${p.notes}</div>` : ''}
            </div>
            <table class="table invoice-table" style="margin-bottom:1rem;font-size:13px;">
                <thead>
                    <tr style="background:#059669;color:#fff">
                        <th>نام جنس</th>
                        <th style="text-align:center;width:70px">تعداد</th>
                        <th style="text-align:left;width:110px">قیمت خرید</th>
                        <th style="text-align:left;width:110px">قیمت فروش</th>
                        <th style="text-align:left;width:110px">جمع</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsRows}
                </tbody>
            </table>
            <div class="invoice-summary" style="width:280px;margin-right:auto;margin-left:0;border-top:2px solid #bbf7d0;padding-top:0.75rem;font-size:13px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:0.35rem;font-weight:700;font-size:15px;color:#059669"><span>مبلغ کل:</span><span>${formatMoney(p.total)}</span></div>
                <div style="display:flex;justify-content:space-between;margin-bottom:0.35rem"><span>پرداخت‌شده:</span><span>${formatMoney(p.paid)}</span></div>
                <div style="display:flex;justify-content:space-between;color:#dc2626;font-weight:700"><span>باقی‌مانده (قروض):</span><span>${formatMoney(p.remaining)}</span></div>
            </div>
            <div class="invoice-footer" style="margin-top:2rem;display:flex;justify-content:space-between;font-size:12px;color:#64748b;border-top:1px dashed #cbd5e1;padding-top:1rem;">
                <div>امضای خریدار: _______________</div>
                <div>امضای فروشنده: _______________</div>
            </div>
        </div>
    `, '<button class="btn btn-secondary no-print" onclick="window.print()">🖨️ پرینت فاکتور</button>');
}

$('searchPurchase').oninput = e => {
    const term = e.target.value.toLowerCase();
    renderPurchases(DB.getPurchases().filter(p => {
        const items = p.items || [];
        const namesMatch = items.some(i => i.productName.toLowerCase().includes(term));
        const supplierMatch = (p.supplier || '').toLowerCase().includes(term);
        return namesMatch || supplierMatch;
    }));
};

function payPurchase(id) {
    const p = DB.getPurchases().find(x => x.id === id);
    const itemNames = (p.items || []).map(i => i.productName).join('، ');
    Modal.open('پرداخت باقی‌مانده خریداری', `
        <p>اقلام: ${itemNames}</p>
        <p>قروض بازار باقی‌مانده: ${formatMoney(p.remaining)}</p>
        <div class="form-group"><label>مبلغ پرداخت (افغانی)</label><input type="number" id="purPayAmt" class="form-control"></div>
        <div class="form-group"><label>تاریخ (شمسی)</label><input type="text" id="purPayDate" class="form-control" placeholder="1403-05-01" value="${todayJalali()}"></div>
    `, `<button class="btn btn-success" onclick="savePurchasePayment(${id})">ثبت پرداخت</button>`);
}

function savePurchasePayment(id) {
    const amount = Number($('purPayAmt').value) || 0;
    if (amount <= 0) return alert('مبلغ نامعتبر');
    const data = DB.getAll();
    const p = data.purchases.find(x => x.id === id);
    if (!p || amount > p.remaining) return alert('مبلغ بیشتر از باقی‌مانده است');

    p.paid += amount;
    p.remaining -= amount;
    if (p.remaining < 0) p.remaining = 0;

    data.marketDebt = (data.marketDebt || 0) - amount;
    if (data.marketDebt < 0) data.marketDebt = 0;

    // Add expense transaction
    const itemNames = (p.items || []).map(i => i.productName).join('، ');
    const tr = {
        type: 'expense',
        description: `پرداخت قروض بازار: ${itemNames} از ${p.supplier || 'بازار'}`,
        amount,
        category: 'خرید جنس',
        date: $('purPayDate').value,
        refType: 'purchase',
        refId: id
    };
    tr.id = DB.getNextId('transaction', data);
    data.transactions.push(tr);

    DB.save(data);
    Modal.close();
    loadPurchases();
    loadFinance();
    loadDashboard();
    loadDebtors();
}

function deletePurchase(id) {
    if (confirm('خریداری حذف شود؟ موجودی و قروض بازار برگشت داده می‌شود.')) {
        DB.deletePurchase(id);
        loadPurchases();
        loadInventory();
        loadFinance();
        loadDashboard();
        loadDebtors();
    }
}

// ==================== ASSETS ====================
function loadAssets() {
    renderAssets(DB.getAssets());
    updateCapitalDisplay();
}

function updateCapitalDisplay() {
    const initialCapital = DB.getInitialCapital();
    const assetsValue = DB.getAssets().reduce((sum, a) => sum + (a.total || 0), 0);
    const remaining = Math.max(0, initialCapital - assetsValue);

    if ($('displayInitialCapital')) $('displayInitialCapital').textContent = formatMoney(initialCapital);
    if ($('displayAssetsValue')) $('displayAssetsValue').textContent = formatMoney(assetsValue);
    if ($('displayRemainingCapital')) $('displayRemainingCapital').textContent = formatMoney(remaining);
    if ($('initialCapitalInput')) $('initialCapitalInput').value = '';
}

function renderAssets(list) {
    $('assetsTable').innerHTML = list.map(a => `
        <tr>
            <td>#${a.id}</td>
            <td>${a.name}</td>
            <td>${a.qty}</td>
            <td>${formatMoney(a.unitPrice)}</td>
            <td>${formatMoney(a.total)}</td>
            <td>${a.supplier || '-'}</td>
            <td>${toPersianDate(a.purchaseDate)}</td>
            <td><span class="badge badge-${a.status === 'فعال' ? 'success' : a.status === 'فروخته‌شده' ? 'warning' : 'danger'}">${a.status}</span></td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="editAsset(${a.id})">✏️</button>
                <button class="btn btn-sm btn-danger" onclick="deleteAsset(${a.id})">🗑️</button>
            </td>
        </tr>
    `).reverse().join('') || '<tr><td colspan="9" style="text-align:center">دارایی ثبت نشده</td></tr>';
}

$('saveCapitalBtn').onclick = () => {
    const val = Number($('initialCapitalInput').value);
    if (isNaN(val) || val < 0) return alert('مبلغ سرمایه اولیه معتبر نیست');
    DB.setInitialCapital(val);
    updateCapitalDisplay();
    loadDashboard();
    alert('سرمایه اولیه ثبت شد');
};

$('addAssetBtn').onclick = () => {
    Modal.open('ثبت دارایی جدید (اموال دکان)', `
        <div class="form-group"><label>نام وسیله / دارایی</label><input type="text" id="aName" class="form-control" placeholder="مثلاً میز، چوکی، کامپیوتر..."></div>
        <div class="form-group"><label>تعداد</label><input type="number" id="aQty" class="form-control" value="1" min="1"></div>
        <div class="form-group"><label>قیمت خرید واحد (افغانی)</label><input type="number" id="aUnitPrice" class="form-control" value="0"></div>
        <div class="form-group"><label>فروشنده / تأمین‌کننده</label><input type="text" id="aSupplier" class="form-control"></div>
        <div class="form-group"><label>تاریخ خرید (شمسی)</label><input type="text" id="aDate" class="form-control" placeholder="1403-05-01" value="${todayJalali()}"></div>
        <div class="form-group"><label>وضعیت</label><select id="aStatus" class="form-control"><option>فعال</option><option>فروخته‌شده</option><option>اسقاط</option></select></div>
        <div class="form-group"><label>توضیحات</label><input type="text" id="aNotes" class="form-control"></div>
    `, '<button class="btn btn-primary" onclick="saveAsset()">ثبت دارایی</button>');
};

function saveAsset() {
    const name = $('aName').value.trim();
    const qty = Number($('aQty').value) || 0;
    const unitPrice = Number($('aUnitPrice').value) || 0;
    if (!name) return alert('نام دارایی الزامی است');
    if (qty <= 0 || unitPrice <= 0) return alert('تعداد و قیمت باید بیشتر از صفر باشد');
    DB.addAsset({
        name,
        qty,
        unitPrice,
        supplier: $('aSupplier').value,
        purchaseDate: $('aDate').value,
        status: $('aStatus').value,
        notes: $('aNotes').value
    });
    Modal.close();
    loadAssets();
    loadFinance();
    loadDashboard();
}

$('searchAsset').oninput = e => {
    const term = e.target.value.toLowerCase();
    renderAssets(DB.getAssets().filter(a => a.name.toLowerCase().includes(term) || (a.supplier || '').toLowerCase().includes(term)));
};

function editAsset(id) {
    const a = DB.getAssets().find(x => x.id === id);
    Modal.open('ویرایش دارایی', `
        <div class="form-group"><label>نام وسیله</label><input type="text" id="aName" class="form-control" value="${a.name}"></div>
        <div class="form-group"><label>تعداد</label><input type="number" id="aQty" class="form-control" value="${a.qty}"></div>
        <div class="form-group"><label>قیمت خرید واحد</label><input type="number" id="aUnitPrice" class="form-control" value="${a.unitPrice}"></div>
        <div class="form-group"><label>فروشنده</label><input type="text" id="aSupplier" class="form-control" value="${a.supplier || ''}"></div>
        <div class="form-group"><label>تاریخ خرید</label><input type="text" id="aDate" class="form-control" value="${a.purchaseDate}"></div>
        <div class="form-group"><label>وضعیت</label><select id="aStatus" class="form-control">
            <option ${a.status === 'فعال' ? 'selected' : ''}>فعال</option>
            <option ${a.status === 'فروخته‌شده' ? 'selected' : ''}>فروخته‌شده</option>
            <option ${a.status === 'اسقاط' ? 'selected' : ''}>اسقاط</option>
        </select></div>
        <div class="form-group"><label>توضیحات</label><input type="text" id="aNotes" class="form-control" value="${a.notes || ''}"></div>
    `, `<button class="btn btn-primary" onclick="updateAsset(${id})">بروزرسانی</button>`);
}

function updateAsset(id) {
    DB.updateAsset(id, {
        name: $('aName').value.trim(),
        qty: Number($('aQty').value) || 1,
        unitPrice: Number($('aUnitPrice').value) || 0,
        supplier: $('aSupplier').value,
        purchaseDate: $('aDate').value,
        status: $('aStatus').value,
        notes: $('aNotes').value
    });
    Modal.close();
    loadAssets();
    loadFinance();
}

function deleteAsset(id) {
    if (confirm('دارایی حذف شود؟')) {
        DB.deleteAsset(id);
        loadAssets();
        loadFinance();
        loadDashboard();
    }
}

// ==================== REPORTS ====================
let currentReportTab = 'sales';
let reportDateFrom = '';
let reportDateTo = '';

function loadReports() {
    switchReportTab('sales');
}

function switchReportTab(tab) {
    currentReportTab = tab;
    document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.querySelector(`.report-tab[data-report="${tab}"]`);
    if (activeTab) activeTab.classList.add('active');
    renderReport();
}

function applyReportFilter() {
    reportDateFrom = $('reportDateFrom').value.trim();
    reportDateTo = $('reportDateTo').value.trim();
    renderReport();
}

function clearReportFilter() {
    reportDateFrom = '';
    reportDateTo = '';
    $('reportDateFrom').value = '';
    $('reportDateTo').value = '';
    renderReport();
}

function filterByDate(items, dateField) {
    return items.filter(item => {
        const d = item[dateField] || '';
        if (reportDateFrom && d < reportDateFrom) return false;
        if (reportDateTo && d > reportDateTo) return false;
        return true;
    });
}

function printReport() {
    window.print();
}

function renderReport() {
    const content = $('reportContent');
    const summary = $('reportSummary');

    switch (currentReportTab) {
        case 'sales':
            renderSalesReport(content, summary);
            break;
        case 'purchases':
            renderPurchasesReport(content, summary);
            break;
        case 'profit':
            renderProfitReport(content, summary);
            break;
        case 'inventory':
            renderInventoryReport(content, summary);
            break;
        case 'debtors':
            renderDebtorsReport(content, summary);
            break;
    }
}

// --- Sales Report ---
function renderSalesReport(content, summary) {
    const sales = filterByDate(DB.getSales(), 'date');
    const totalSales = sales.reduce((s, x) => s + (x.total || 0), 0);
    const totalPaid = sales.reduce((s, x) => s + (x.paid || 0), 0);
    const totalDebt = sales.reduce((s, x) => s + (x.debt || 0), 0);
    const totalDiscount = sales.reduce((s, x) => s + (x.discount || 0), 0);
    const count = sales.length;

    const dateLabel = reportDateFrom || reportDateTo
        ? `از ${toPersianDate(reportDateFrom || '...')} تا ${toPersianDate(reportDateTo || '...')}`
        : 'همه تاریخ‌ها';

    content.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3>📊 گزارش فروش — ${dateLabel}</h3>
            </div>
            <div class="card-body" style="overflow-x:auto">
                <table class="report-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>مشتری</th>
                            <th>تاریخ</th>
                            <th>جمع فرعی</th>
                            <th>تخفیف</th>
                            <th>مبلغ کل</th>
                            <th>پرداخت‌شده</th>
                            <th>باقی‌مانده</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sales.length ? sales.map(s => `
                            <tr>
                                <td>#${s.id}</td>
                                <td>${s.customer}</td>
                                <td>${toPersianDate(s.date)}</td>
                                <td>${formatMoney(s.subtotal)}</td>
                                <td>${formatMoney(s.discount)}</td>
                                <td><strong>${formatMoney(s.total)}</strong></td>
                                <td>${formatMoney(s.paid)}</td>
                                <td><span class="badge badge-${s.debt > 0 ? 'danger' : 'success'}">${formatMoney(s.debt)}</span></td>
                            </tr>
                        `).join('') : '<tr><td colspan="8" class="report-empty"><div class="empty-icon">📭</div>فروشی در این بازه ثبت نشده</td></tr>'}
                    </tbody>
                    ${sales.length ? `
                    <tfoot>
                        <tr>
                            <td colspan="3">جمع کل (${count} فاکتور)</td>
                            <td>${formatMoney(sales.reduce((s,x) => s + (x.subtotal||0), 0))}</td>
                            <td>${formatMoney(totalDiscount)}</td>
                            <td>${formatMoney(totalSales)}</td>
                            <td>${formatMoney(totalPaid)}</td>
                            <td>${formatMoney(totalDebt)}</td>
                        </tr>
                    </tfoot>` : ''}
                </table>
            </div>
        </div>
    `;

    summary.innerHTML = `
        <div class="summary-card info">
            <div class="summary-label">تعداد فاکتورها</div>
            <div class="summary-value">${count}</div>
        </div>
        <div class="summary-card">
            <div class="summary-label">فروش کل</div>
            <div class="summary-value">${formatMoney(totalSales)}</div>
        </div>
        <div class="summary-card success">
            <div class="summary-label">دریافت‌شده</div>
            <div class="summary-value">${formatMoney(totalPaid)}</div>
        </div>
        <div class="summary-card danger">
            <div class="summary-label">باقی‌مانده (طلب)</div>
            <div class="summary-value">${formatMoney(totalDebt)}</div>
        </div>
        <div class="summary-card warning">
            <div class="summary-label">تخفیف</div>
            <div class="summary-value">${formatMoney(totalDiscount)}</div>
        </div>
    `;
}

// --- Purchases Report ---
function renderPurchasesReport(content, summary) {
    const purchases = filterByDate(DB.getPurchases(), 'date');
    const totalPurchases = purchases.reduce((s, x) => s + (x.total || 0), 0);
    const totalPaid = purchases.reduce((s, x) => s + (x.paid || 0), 0);
    const totalRemaining = purchases.reduce((s, x) => s + (x.remaining || 0), 0);
    const count = purchases.length;

    const dateLabel = reportDateFrom || reportDateTo
        ? `از ${toPersianDate(reportDateFrom || '...')} تا ${toPersianDate(reportDateTo || '...')}`
        : 'همه تاریخ‌ها';

    content.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3>🛍️ گزارش خریداری — ${dateLabel}</h3>
            </div>
            <div class="card-body" style="overflow-x:auto">
                <table class="report-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>اقلام</th>
                            <th>تأمین‌کننده</th>
                            <th>تاریخ</th>
                            <th>مبلغ کل</th>
                            <th>پرداخت‌شده</th>
                            <th>باقی‌مانده (قروض)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${purchases.length ? purchases.map(p => {
                            const items = p.items || [];
                            const itemCount = items.length;
                            const firstItem = items[0] ? items[0].productName : (p.productName || '-');
                            const itemLabel = itemCount > 1 ? `${firstItem} و ${itemCount - 1} مورد دیگر` : firstItem;
                            return `
                            <tr>
                                <td>#${p.id}</td>
                                <td>${itemLabel}</td>
                                <td>${p.supplier || '-'}</td>
                                <td>${toPersianDate(p.date)}</td>
                                <td><strong>${formatMoney(p.total)}</strong></td>
                                <td>${formatMoney(p.paid)}</td>
                                <td><span class="badge badge-${p.remaining > 0 ? 'danger' : 'success'}">${formatMoney(p.remaining)}</span></td>
                            </tr>`;
                        }).join('') : '<tr><td colspan="7" class="report-empty"><div class="empty-icon">📭</div>خریداری در این بازه ثبت نشده</td></tr>'}
                    </tbody>
                    ${purchases.length ? `
                    <tfoot>
                        <tr>
                            <td colspan="4">جمع کل (${count} فاکتور)</td>
                            <td>${formatMoney(totalPurchases)}</td>
                            <td>${formatMoney(totalPaid)}</td>
                            <td>${formatMoney(totalRemaining)}</td>
                        </tr>
                    </tfoot>` : ''}
                </table>
            </div>
        </div>
    `;

    summary.innerHTML = `
        <div class="summary-card info">
            <div class="summary-label">تعداد فاکتورها</div>
            <div class="summary-value">${count}</div>
        </div>
        <div class="summary-card">
            <div class="summary-label">خریداری کل</div>
            <div class="summary-value">${formatMoney(totalPurchases)}</div>
        </div>
        <div class="summary-card success">
            <div class="summary-label">پرداخت‌شده</div>
            <div class="summary-value">${formatMoney(totalPaid)}</div>
        </div>
        <div class="summary-card danger">
            <div class="summary-label">قروض بازار</div>
            <div class="summary-value">${formatMoney(totalRemaining)}</div>
        </div>
    `;
}

// --- Profit/Loss Report ---
function renderProfitReport(content, summary) {
    const transactions = filterByDate(DB.getTransactions(), 'date');
    const incomeItems = transactions.filter(t => t.type === 'income');
    const expenseItems = transactions.filter(t => t.type === 'expense');

    const totalIncome = incomeItems.reduce((s, x) => s + (x.amount || 0), 0);
    const totalExpense = expenseItems.reduce((s, x) => s + (x.amount || 0), 0);
    const netProfit = totalIncome - totalExpense;

    const dateLabel = reportDateFrom || reportDateTo
        ? `از ${toPersianDate(reportDateFrom || '...')} تا ${toPersianDate(reportDateTo || '...')}`
        : 'همه تاریخ‌ها';

    content.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3>💰 گزارش سود و زیان — ${dateLabel}</h3>
            </div>
            <div class="card-body">
                <div class="profit-section">
                    <div class="profit-section-header income">📥 درآمد (جمع: ${formatMoney(totalIncome)})</div>
                    <table class="report-table">
                        <thead>
                            <tr><th>مبلغ</th></tr>
                        </thead>
                        <tbody>
                            ${totalIncome ? `
                                <tr><td><strong>${formatMoney(totalIncome)}</strong></td></tr>
                            ` : '<tr><td style="text-align:center;color:var(--secondary)">درآمدی ثبت نشده</td></tr>'}
                        </tbody>
                    </table>
                </div>

                <div class="profit-section">
                    <div class="profit-section-header expense">📤 هزینه (جمع: ${formatMoney(totalExpense)})</div>
                    <table class="report-table">
                        <thead>
                            <tr><th>مبلغ</th></tr>
                        </thead>
                        <tbody>
                            ${totalExpense ? `
                                <tr><td><strong>${formatMoney(totalExpense)}</strong></td></tr>
                            ` : '<tr><td style="text-align:center;color:var(--secondary)">هزینه‌ای ثبت نشده</td></tr>'}
                        </tbody>
                    </table>
                </div>

                <div class="profit-net ${netProfit >= 0 ? 'positive' : 'negative'}">
                    ${netProfit >= 0 ? '✅' : '❌'} سود خالص: ${formatMoney(Math.abs(netProfit))} ${netProfit >= 0 ? '(سود)' : '(زیان)'}
                </div>
            </div>
        </div>

        <div class="card" style="margin-top:16px">
            <div class="card-header">
                <h3>📋 جزئیات تراکنش‌ها</h3>
            </div>
            <div class="card-body" style="overflow-x:auto">
                <table class="report-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>نوع</th>
                            <th>توضیحات</th>
                            <th>مبلغ</th>
                            <th>تاریخ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${transactions.length ? transactions.map(t => `
                            <tr>
                                <td>#${t.id}</td>
                                <td><span class="badge badge-${t.type === 'income' ? 'success' : 'danger'}">${t.type === 'income' ? 'درآمد' : 'هزینه'}</span></td>
                                <td>${t.description}</td>
                                <td>${formatMoney(t.amount)}</td>
                                <td>${toPersianDate(t.date)}</td>
                            </tr>
                        `).join('') : '<tr><td colspan="5" class="report-empty"><div class="empty-icon">📭</div>تراکنشی ثبت نشده</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    summary.innerHTML = `
        <div class="summary-card success">
            <div class="summary-label">کل درآمد</div>
            <div class="summary-value">${formatMoney(totalIncome)}</div>
        </div>
        <div class="summary-card danger">
            <div class="summary-label">کل هزینه</div>
            <div class="summary-value">${formatMoney(totalExpense)}</div>
        </div>
        <div class="summary-card ${netProfit >= 0 ? 'success' : 'danger'}">
            <div class="summary-label">${netProfit >= 0 ? 'سود خالص' : 'زیان خالص'}</div>
            <div class="summary-value">${formatMoney(Math.abs(netProfit))}</div>
        </div>
    `;
}

// --- Inventory Report ---
function renderInventoryReport(content, summary) {
    const products = DB.getProducts();
    const totalItems = products.reduce((s, p) => s + (p.stock || 0), 0);
    const totalBuyValue = products.reduce((s, p) => s + ((p.stock || 0) * (p.buyPrice || 0)), 0);
    const totalSellValue = products.reduce((s, p) => s + ((p.stock || 0) * (p.sellPrice || 0)), 0);
    const potentialProfit = totalSellValue - totalBuyValue;
    const lowStockCount = products.filter(p => (p.stock || 0) <= 5).length;
    const outOfStockCount = products.filter(p => (p.stock || 0) === 0).length;

    content.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3>📦 گزارش انبار</h3>
            </div>
            <div class="card-body" style="overflow-x:auto">
                <table class="report-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>نام محصول</th>
                            <th>قیمت خرید</th>
                            <th>قیمت فروش</th>
                            <th>موجودی</th>
                            <th>ارزش خرید</th>
                            <th>ارزش فروش</th>
                            <th>سود بالقوه</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${products.length ? products.map(p => {
                            const stock = p.stock || 0;
                            const buyVal = stock * (p.buyPrice || 0);
                            const sellVal = stock * (p.sellPrice || 0);
                            const profit = sellVal - buyVal;
                            const stockBadge = stock === 0 ? 'danger' : stock <= 5 ? 'warning' : 'success';
                            return `
                                <tr>
                                    <td>#${p.id}</td>
                                    <td>${p.name}</td>
                                    <td>${formatMoney(p.buyPrice)}</td>
                                    <td>${formatMoney(p.sellPrice)}</td>
                                    <td><span class="badge badge-${stockBadge}">${stock}</span></td>
                                    <td>${formatMoney(buyVal)}</td>
                                    <td>${formatMoney(sellVal)}</td>
                                    <td><span class="badge badge-${profit >= 0 ? 'success' : 'danger'}">${formatMoney(profit)}</span></td>
                                </tr>
                            `;
                        }).join('') : '<tr><td colspan="8" class="report-empty"><div class="empty-icon">📭</div>محصولی ثبت نشده</td></tr>'}
                    </tbody>
                    ${products.length ? `
                    <tfoot>
                        <tr>
                            <td colspan="4">جمع کل</td>
                            <td>${totalItems.toLocaleString('fa-AF')}</td>
                            <td>${formatMoney(totalBuyValue)}</td>
                            <td>${formatMoney(totalSellValue)}</td>
                            <td><strong>${formatMoney(potentialProfit)}</strong></td>
                        </tr>
                    </tfoot>` : ''}
                </table>
            </div>
        </div>
    `;

    summary.innerHTML = `
        <div class="summary-card info">
            <div class="summary-label">تعداد محصولات</div>
            <div class="summary-value">${products.length}</div>
        </div>
        <div class="summary-card">
            <div class="summary-label">مجموع موجودی</div>
            <div class="summary-value">${totalItems.toLocaleString('fa-AF')} عدد</div>
        </div>
        <div class="summary-card">
            <div class="summary-label">ارزش انبار (خرید)</div>
            <div class="summary-value">${formatMoney(totalBuyValue)}</div>
        </div>
        <div class="summary-card success">
            <div class="summary-label">ارزش انبار (فروش)</div>
            <div class="summary-value">${formatMoney(totalSellValue)}</div>
        </div>
        <div class="summary-card ${potentialProfit >= 0 ? 'success' : 'danger'}">
            <div class="summary-label">سود بالقوه</div>
            <div class="summary-value">${formatMoney(potentialProfit)}</div>
        </div>
        <div class="summary-card warning">
            <div class="summary-label">موجودی کم (≤5)</div>
            <div class="summary-value">${lowStockCount}</div>
        </div>
        <div class="summary-card danger">
            <div class="summary-label">ناموجود</div>
            <div class="summary-value">${outOfStockCount}</div>
        </div>
    `;
}

// --- Debtors/Creditors Report ---
function renderDebtorsReport(content, summary) {
    const debtors = DB.getDebtors();
    const creditors = DB.getCreditors();
    const totalReceivable = debtors.reduce((s, d) => s + (d.totalDebt || 0), 0);
    const totalPayable = creditors.reduce((s, c) => s + (c.totalDebt || 0), 0);
    const netBalance = totalReceivable - totalPayable;

    content.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3>📝 گزارش طلبکاران (بدهکاران)</h3>
            </div>
            <div class="card-body" style="overflow-x:auto">
                <table class="report-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>نام</th>
                            <th>شماره تماس</th>
                            <th>مبلغ طلب</th>
                            <th>آخرین تاریخ</th>
                            <th>منشأ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${debtors.length ? debtors.map(d => {
                            const sources = (d.sources || []).map(s => {
                                const label = s.type === 'sale' ? 'فروش' : s.type === 'repair' ? 'تعمیر' : 'پروژه';
                                return `${label} #${s.id}`;
                            }).join('، ');
                            return `
                                <tr>
                                    <td>${d.id}</td>
                                    <td>${d.name}</td>
                                    <td>${d.phone || '-'}</td>
                                    <td><span class="badge badge-danger">${formatMoney(d.totalDebt)}</span></td>
                                    <td>${toPersianDate(d.lastDate)}</td>
                                    <td><small>${sources || '-'}</small></td>
                                </tr>
                            `;
                        }).join('') : '<tr><td colspan="5" class="report-empty"><div class="empty-icon">✅</div>طلبکاری ثبت نشده</td></tr>'}
                    </tbody>
                    ${debtors.length ? `
                    <tfoot>
                        <tr>
                            <td colspan="3">جمع طلب‌ها (${debtors.length} شخص)</td>
                            <td>${formatMoney(totalReceivable)}</td>
                            <td colspan="2"></td>
                        </tr>
                    </tfoot>` : ''}
                </table>
            </div>
        </div>

        <div class="card" style="margin-top:16px">
            <div class="card-header">
                <h3>📝 گزارش بستانکاران (قروض بازار)</h3>
            </div>
            <div class="card-body" style="overflow-x:auto">
                <table class="report-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>نام تأمین‌کننده</th>
                            <th>مبلغ قروض</th>
                            <th>منشأ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${creditors.length ? creditors.map(c => {
                            const sources = (c.sources || []).map(s => `خرید #${s.id}`).join('، ');
                            return `
                                <tr>
                                    <td>${c.id}</td>
                                    <td>${c.name}</td>
                                    <td><span class="badge badge-danger">${formatMoney(c.totalDebt)}</span></td>
                                    <td><small>${sources || '-'}</small></td>
                                </tr>
                            `;
                        }).join('') : '<tr><td colspan="4" class="report-empty"><div class="empty-icon">✅</div>قروضی ثبت نشده</td></tr>'}
                    </tbody>
                    ${creditors.length ? `
                    <tfoot>
                        <tr>
                            <td colspan="2">جمع قروض (${creditors.length} تأمین‌کننده)</td>
                            <td>${formatMoney(totalPayable)}</td>
                            <td></td>
                        </tr>
                    </tfoot>` : ''}
                </table>
            </div>
        </div>

        <div class="profit-net ${netBalance >= 0 ? 'positive' : 'negative'}" style="margin-top:16px">
            ${netBalance >= 0 ? '📊' : '⚠️'} تراز طلب/قروض: ${formatMoney(Math.abs(netBalance))} ${netBalance >= 0 ? '(طلب بیشتر از قروض)' : '(قروض بیشتر از طلب)'}
        </div>
    `;

    summary.innerHTML = `
        <div class="summary-card info">
            <div class="summary-label">تعداد طلبکاران</div>
            <div class="summary-value">${debtors.length}</div>
        </div>
        <div class="summary-card">
            <div class="summary-label">کل طلب‌ها</div>
            <div class="summary-value">${formatMoney(totalReceivable)}</div>
        </div>
        <div class="summary-card info">
            <div class="summary-label">تعداد بستانکاران</div>
            <div class="summary-value">${creditors.length}</div>
        </div>
        <div class="summary-card danger">
            <div class="summary-label">کل قروض</div>
            <div class="summary-value">${formatMoney(totalPayable)}</div>
        </div>
        <div class="summary-card ${netBalance >= 0 ? 'success' : 'danger'}">
            <div class="summary-label">تراز خالص</div>
            <div class="summary-value">${formatMoney(Math.abs(netBalance))}</div>
        </div>
    `;
}

// ==================== SETTINGS ====================
function loadSettings() {
    const shop = DB.getShop();
    $('shopName').value = shop.name;
    $('shopAddress').value = shop.address;
    $('shopPhone').value = shop.phone;
    $('marketDebt').value = DB.getMarketDebt();
    loadCloudSettings();
}

$('saveShopInfo').onclick = () => {
    DB.updateShop({
        name: $('shopName').value,
        address: $('shopAddress').value,
        phone: $('shopPhone').value
    });
    DB.updateMarketDebt($('marketDebt').value);
    alert('ذخیره شد');
};

$('exportData').onclick = () => {
    const blob = new Blob([DB.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'electric-shop-backup-' + todayJalali() + '.json';
    a.click();
};

$('clearData').onclick = () => {
    if (confirm('همه داده‌ها حذف می‌شوند! مطمئن هستید؟')) {
        DB.clearAll();
        alert('داده‌ها بازنشانی شدند');
        location.reload();
    }
};

$('exportBtn').onclick = () => {
    const blob = new Blob([DB.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backup-' + todayJalali() + '.json';
    a.click();
};

$('importBtn').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            DB.importData(ev.target.result);
            alert('داده‌ها با موفقیت وارد شدند');
            location.reload();
        } catch (err) {
            alert('فایل نامعتبر است');
        }
    };
    reader.readAsText(file);
};

// ==================== CLOUD SYNC SETTINGS ====================
function loadCloudSettings() {
    const c = CloudSync.cfg();
    $('cloudProvider').value = c.provider || 'supabase';
    $('supabaseUrl').value = c.supabaseUrl || '';
    $('supabaseKey').value = c.supabaseKey || '';
    $('customApiUrl').value = c.customApiUrl || '';
    $('customApiKey').value = c.customApiKey || '';
    $('cloudShopId').value = c.shopId || '';
    $('cloudShopPin').value = c.shopPin || '';
    $('syncInterval').value = c.pullInterval || 60;
    toggleCloudProviderFields();
    CloudSync.refreshUI();
}

function toggleCloudProviderFields() {
    const v = $('cloudProvider').value;
    $('supabaseFields').style.display = v === 'supabase' ? '' : 'none';
    $('customFields').style.display = v === 'custom' ? '' : 'none';
}

$('cloudProvider').onchange = toggleCloudProviderFields;

$('connectCloud').onclick = async () => {
    const settings = {
        provider: $('cloudProvider').value,
        supabaseUrl: $('supabaseUrl').value.trim(),
        supabaseKey: $('supabaseKey').value.trim(),
        customApiUrl: $('customApiUrl').value.trim(),
        customApiKey: $('customApiKey').value.trim(),
        shopId: $('cloudShopId').value.trim(),
        shopPin: $('cloudShopPin').value.trim(),
        pullInterval: parseInt($('syncInterval').value) || 60
    };
    if (!settings.shopId) {
        alert('لطفاً شناسه دکان را وارد کنید');
        return;
    }
    if (settings.provider === 'supabase') {
        if (!settings.supabaseUrl || !settings.supabaseKey) {
            alert('لطفاً آدرس و کلید Supabase را وارد کنید');
            return;
        }
    } else {
        if (!settings.customApiUrl) {
            alert('لطفاً آدرس سرور API را وارد کنید');
            return;
        }
    }

    $('connectCloud').disabled = true;
    $('connectCloud').textContent = '⏳ در حال اتصال...';
    try {
        const result = await CloudSync.connect(settings);
        if (result.ok) {
            alert(result.pulled ? 'اتصال موفق! داده‌های ابری بارگذاری شد.' : 'اتصال موفق! داده‌های محلی به ابر ارسال شد.');
            location.reload();
        } else {
            alert('خطا در اتصال:\n' + (result.error || 'نامشخص') + '\n\nلطفاً بررسی کنید:\n۱. آدرس پروژه: فقط https://xxx.supabase.co (بدون /rest/v1)\n۲. کلید عمومی: anon public (شروع با eyJ...)\n۳. جدول shop_data ساخته شده باشد');
        }
    } catch (e) {
        alert('خطا در اتصال:\n' + e.message + '\n\nلطفاً بررسی کنید:\n۱. آدرس پروژه: فقط https://xxx.supabase.co (بدون /rest/v1)\n۲. کلید عمومی: anon public (شروع با eyJ...)\n۳. جدول shop_data ساخته شده باشد');
    }
    $('connectCloud').disabled = false;
    $('connectCloud').textContent = '☁️ اتصال به ابر';
};

$('disconnectCloud').onclick = () => {
    if (confirm('آیا از قطع اتصال ابری مطمئن هستید؟\nداده‌ها همچنان در مرورگر ذخیره می‌شوند اما دیگر همگام‌سازی نمی‌شوند.')) {
        CloudSync.disconnect();
        alert('اتصال ابری قطع شد');
    }
};

$('forceSyncCloud').onclick = async () => {
    $('forceSyncCloud').disabled = true;
    $('forceSyncCloud').textContent = '🔄 در حال همگام‌سازی...';
    try {
        await CloudSync.push();
        const changed = await CloudSync.forcePull();
        if (!changed) CloudSync._showSyncNotification('✅ داده‌ها به‌روز است');
    } catch (e) {
        alert('خطا در همگام‌سازی: ' + e.message);
    }
    $('forceSyncCloud').disabled = false;
    $('forceSyncCloud').textContent = '🔄 همگام‌سازی دستی';
};

$('changeCloudPin').onclick = async () => {
    const currentPin = CloudSync.cfg().shopPin || '';
    const oldPin = prompt('رمز عبور فعلی را وارد کنید:');
    if (oldPin === null) return;
    if (oldPin !== currentPin) {
        alert('رمز عبور فعلی اشتباه است!');
        return;
    }
    const newPin = prompt('رمز عبور جدید را وارد کنید:');
    if (newPin === null) return;
    if (!newPin.trim()) {
        alert('رمز عبور نمی‌تواند خالی باشد!');
        return;
    }
    try {
        await CloudSync.changePin(newPin.trim());
        $('cloudShopPin').value = newPin.trim();
        alert('رمز عبور با موفقیت تغییر کرد! ✅');
    } catch (e) {
        alert('خطا در تغییر رمز عبور: ' + e.message);
    }
};

// Click sync indicator in header → force pull
$('syncIndicator').onclick = async () => {
    if (!CloudSync.cfg().enabled) {
        alert('ذخیره ابری فعال نیست. از تنظیمات فعال کنید.');
        return;
    }
    const changed = await CloudSync.forcePull();
    if (changed) {
        const p = document.querySelector('.page.active');
        if (p) refreshPage(p.id);
    }
};

loadCloudSettings();

// ==================== PIN LOCK SCREEN ====================
function checkPinLock() {
    const c = CloudSync.cfg();
    // Only show lock if cloud is enabled AND a PIN is set AND not already verified this session
    if (c.enabled && c.shopPin && !sessionStorage.getItem('pin_verified')) {
        const overlay = $('pinLockOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            $('pinLockInput').value = '';
            $('pinLockError').style.display = 'none';
            $('pinLockInput').focus();
        }
        return true;  // locked
    }
    return false;  // not locked
}

function submitPinLock() {
    const input = $('pinLockInput').value.trim();
    const c = CloudSync.cfg();
    if (!input) return;
    if (input === c.shopPin) {
        sessionStorage.setItem('pin_verified', '1');
        const overlay = $('pinLockOverlay');
        if (overlay) {
            overlay.style.animation = 'pinLockFadeOut 0.3s ease forwards';
            setTimeout(() => {
                overlay.style.display = 'none';
                overlay.style.animation = '';
            }, 300);
        }
    } else {
        $('pinLockError').style.display = 'block';
        $('pinLockError').style.animation = 'none';
        // Force reflow to restart animation
        void $('pinLockError').offsetWidth;
        $('pinLockError').style.animation = 'pinLockShake 0.4s ease';
        $('pinLockInput').value = '';
        $('pinLockInput').focus();
    }
}

// Enter key on PIN input → submit
$('pinLockInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitPinLock();
});

// ==================== EXCEL IMPORT / EXPORT ====================

const SECTION_COLUMNS = {
    inventory: {
        headers: ['شماره', 'نام محصول', 'قیمت خرید', 'قیمت فروش', 'موجودی'],
        keys: ['id', 'name', 'buyPrice', 'sellPrice', 'stock'],
        getData: () => DB.getProducts(),
        addRow: (row) => DB.addProduct({ name: row['نام محصول'] || '', buyPrice: Number(row['قیمت خرید']) || 0, sellPrice: Number(row['قیمت فروش']) || 0, stock: Number(row['موجودی']) || 0 }),
        reload: loadInventory
    },
    purchases: {
        headers: ['شماره', 'تاریخ', 'فروشنده', 'مبلغ کل', 'پرداخت‌شده', 'باقی‌مانده', 'اقلام'],
        keys: ['id', 'date', 'supplier', 'total', 'paid', 'remaining', '_itemsText'],
        getData: () => DB.getPurchases().map(p => ({ ...p, _itemsText: (p.items || []).map(i => `${i.productName}×${i.qty}@${i.unitPrice}`).join(' | ') })),
        addRow: null, // Purchases have nested items — import not supported via simple Excel
        reload: () => { loadPurchases(); loadInventory(); loadFinance(); }
    },
    sales: {
        headers: ['شماره', 'تاریخ', 'مشتری', 'شماره تماس', 'مبلغ کل', 'تخفیف', 'مبلغ پرداخت', 'پرداخت‌شده', 'بدهی', 'آیتم‌ها'],
        keys: ['id', 'date', 'customer', 'phone', 'totalAmount', 'discount', 'payable', 'paid', 'debt', '_itemsText'],
        getData: () => DB.getSales().map(s => ({ ...s, _itemsText: (s.items || []).map(i => `${i.name}×${i.qty}@${i.price}`).join(' | ') })),
        addRow: null, // Sales have nested items — import not supported via simple Excel
        reload: loadSales
    },
    repairs: {
        headers: ['شماره', 'تاریخ دریافت', 'مشتری', 'دستگاه', 'مشکل', 'وضعیت', 'هزینه', 'پرداخت‌شده', 'باقی‌مانده', 'شماره تماس'],
        keys: ['id', 'receiveDate', 'customer', 'device', 'issue', 'status', 'cost', 'paid', 'remaining', 'phone'],
        getData: () => DB.getRepairs(),
        addRow: (row) => DB.addRepair({ customer: row['مشتری'] || '', device: row['دستگاه'] || '', issue: row['مشکل'] || '', receiveDate: row['تاریخ دریافت'] || todayJalali(), status: row['وضعیت'] || 'دریافت‌شده', cost: Number(row['هزینه']) || 0, paid: Number(row['پرداخت‌شده']) || 0, phone: row['شماره تماس'] || '' }),
        reload: loadRepairs
    },
    projects: {
        headers: ['شماره', 'نام پروژه', 'مشتری', 'آدرس', 'تاریخ شروع', 'مبلغ قرارداد', 'پرداخت‌شده', 'وضعیت', 'شماره تماس', 'توضیحات'],
        keys: ['id', 'name', 'client', 'address', 'startDate', 'amount', 'paid', 'status', 'phone', 'description'],
        getData: () => DB.getProjects(),
        addRow: (row) => DB.addProject({ name: row['نام پروژه'] || '', client: row['مشتری'] || '', address: row['آدرس'] || '', startDate: row['تاریخ شروع'] || todayJalali(), amount: Number(row['مبلغ قرارداد']) || 0, paid: Number(row['پرداخت‌شده']) || 0, status: row['وضعیت'] || 'شروع نشده', phone: row['شماره تماس'] || '', description: row['توضیحات'] || '' }),
        reload: loadProjects
    },
    employees: {
        headers: ['شماره', 'نام', 'نقش', 'شماره تماس', 'حقوق/سهم ماهانه', 'پرداخت‌شده', 'بدهکاری'],
        keys: ['id', 'name', 'role', 'phone', 'salary', 'paid', 'debt'],
        getData: () => DB.getEmployees(),
        addRow: (row) => DB.addEmployee({ name: row['نام'] || '', role: row['نقش'] || 'کارمند', phone: row['شماره تماس'] || '', salary: Number(row['حقوق/سهم ماهانه']) || 0 }),
        reload: loadEmployees
    },
    debtors: {
        headers: ['نام', 'شماره تماس', 'مجموع بدهی', 'آخرین تاریخ', 'منابع'],
        keys: ['name', 'phone', 'totalDebt', 'lastDate', '_sourcesText'],
        getData: () => DB.getDebtors().map(d => ({ ...d, _sourcesText: (d.sources || []).map(s => `${s.type}#${s.id}: ${formatMoney(s.amount)}`).join(' | ') })),
        addRow: null, // Debtors are dynamically computed — export-only
        reload: loadDebtors
    },
    creditors: {
        headers: ['نام', 'مجموع بدهی', 'منابع'],
        keys: ['name', 'totalDebt', '_sourcesText'],
        getData: () => DB.getCreditors().map(c => ({ ...c, _sourcesText: (c.sources || []).map(s => `${s.type}#${s.id}: ${formatMoney(s.amount)}`).join(' | ') })),
        addRow: null, // Creditors are dynamically computed — export-only
        reload: loadDebtors
    },
    transactions: {
        headers: ['شماره', 'تاریخ', 'نوع', 'شرح', 'مبلغ'],
        keys: ['id', 'date', 'type', 'description', 'amount'],
        getData: () => DB.getTransactions(),
        addRow: (row) => DB.addTransaction({ type: row['نوع'] || 'expense', description: row['شرح'] || '', amount: Number(row['مبلغ']) || 0, date: row['تاریخ'] || todayJalali() }),
        reload: () => { txPage = 1; loadFinance(); }
    },
    assets: {
        headers: ['شماره', 'نام دارایی', 'تعداد', 'قیمت واحد', 'مبلغ کل', 'تاریخ خرید', 'فروشنده', 'وضعیت', 'توضیحات'],
        keys: ['id', 'name', 'qty', 'unitPrice', 'total', 'purchaseDate', 'supplier', 'status', 'notes'],
        getData: () => DB.getAssets(),
        addRow: (row) => DB.addAsset({ name: row['نام دارایی'] || '', qty: Number(row['تعداد']) || 1, unitPrice: Number(row['قیمت واحد']) || 0, purchaseDate: row['تاریخ خرید'] || todayJalali(), supplier: row['فروشنده'] || '', status: row['وضعیت'] || 'فعال', notes: row['توضیحات'] || '' }),
        reload: () => { loadAssets(); loadFinance(); }
    }
};

function exportSectionExcel(section) {
    const cfg = SECTION_COLUMNS[section];
    if (!cfg) return alert('بخش نامعتبر است');
    const data = cfg.getData();
    if (!data || data.length === 0) return alert('داده‌ای برای خروجی وجود ندارد');

    // Build rows using Persian headers
    const rows = data.map(item => {
        const row = {};
        cfg.headers.forEach((h, i) => {
            const key = cfg.keys[i];
            let val = item[key];
            // Format money fields for readability
            if (['buyPrice','sellPrice','unitPrice','total','paid','remaining','cost','amount','salary','debt','totalDebt','totalAmount','payable','discount'].includes(key) && val !== undefined && val !== null) {
                val = Number(val);
            }
            row[h] = val !== undefined && val !== null ? val : '';
        });
        return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows, { header: cfg.headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, section);
    const fileName = `fanous_${section}_${todayJalali().replace(/-/g, '')}.xlsx`;
    XLSX.writeFile(wb, fileName);
    CloudSync._showSyncNotification(`✅ فایل اکسل «${section}» ذخیره شد`);
}

function importSectionExcel(section, fileInput) {
    const cfg = SECTION_COLUMNS[section];
    if (!cfg) return alert('بخش نامعتبر است');
    if (!cfg.addRow) return alert('ورودی اکسل برای این بخش پشتیبانی نمی‌شود (فقط خروجی ممکن است)');

    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(ws);

            if (json.length === 0) return alert('فایل اکسل خالی است');

            let imported = 0, errors = 0;
            json.forEach((row, idx) => {
                try {
                    cfg.addRow(row);
                    imported++;
                } catch(err) {
                    console.error(`Row ${idx + 2} error:`, err);
                    errors++;
                }
            });

            if (cfg.reload) cfg.reload();
            loadDashboard();

            let msg = `✅ ${imported} ردیف وارد شد`;
            if (errors > 0) msg += ` | ⚠️ ${errors} ردیف خطا`;
            CloudSync._showSyncNotification(msg);
        } catch(err) {
            console.error('Excel import error:', err);
            alert('خطا در خواندن فایل اکسل: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
    // Reset file input so same file can be re-selected
    fileInput.value = '';
}

// ==================== END EXCEL IMPORT / EXPORT ====================

// Date display
$('currentDate').textContent = new Date().toLocaleDateString('fa-AF', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

// Init — check PIN lock first
if (!checkPinLock()) {
    loadDashboard();
}
