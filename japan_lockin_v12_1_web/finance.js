(() => {
  const CURRENCIES = ['BDT', 'JPY', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR'];
  const TYPE_NAMES = { income: 'Income', expense: 'Expense', savings: 'Savings', transfer: 'Transfer' };
  const DEFAULT_CATEGORIES = [
    ['expense', 'Food', '🍜', '#f97316'], ['expense', 'Housing', '🏠', '#8b5cf6'],
    ['expense', 'Transport', '🚌', '#0ea5e9'], ['expense', 'Bills', '🧾', '#64748b'],
    ['expense', 'Health', '🩺', '#ef4444'], ['expense', 'Education', '🎓', '#6366f1'],
    ['expense', 'Shopping', '🛍️', '#ec4899'], ['expense', 'Entertainment', '🎬', '#a855f7'],
    ['expense', 'Other expense', '📦', '#94a3b8'], ['income', 'Salary', '💼', '#16a34a'],
    ['income', 'Business', '🏪', '#14b8a6'], ['income', 'Bonus', '🎁', '#22c55e'],
    ['income', 'Other income', '✨', '#84cc16'], ['savings', 'Emergency Fund', '🛟', '#2563eb'],
    ['savings', 'Japan Fund', '🇯🇵', '#0891b2'], ['savings', 'Investment', '📈', '#7c3aed'],
    ['savings', 'Other savings', '🐷', '#06b6d4']
  ].map(([type, name, icon, color]) => ({ id: `cat-${type}-${slug(name)}`, type, name, icon, color, active: true }));
  const currencyFormatters = new Map();
  function currencyFormatter(currency = data().currency) {
    let formatter = currencyFormatters.get(currency);
    if (!formatter) {
      formatter = new Intl.NumberFormat('en-BD', {
        style: 'currency', currency, currencyDisplay: 'narrowSymbol',
        maximumFractionDigits: currency === 'JPY' ? 0 : 2
      });
      currencyFormatters.set(currency, formatter);
    }
    return formatter;
  }

  function slug(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  }
  function makeId(prefix) {
    return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;
  }
  function validDate(value) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value || '')))return false;
    const parsed=new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
  }
  function dateFromToday() {
    return api.dateISO ? api.dateISO() : new Date().toISOString().slice(0, 10);
  }
  function timeFromNow() {
    return api.timeISO ? api.timeISO() : `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  }
  function finiteAmount(value) {
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : 0;
  }
  function seededAccount() {
    return { id: 'acc-cash', name: 'Cash', type: 'cash', openingBalance: 0, active: true, createdAt: new Date().toISOString() };
  }
  function normalize(value) {
    const source = value && typeof value === 'object' ? value : {};
    const categories = Array.isArray(source.categories) ? source.categories.filter(x => x && typeof x === 'object').map(x => ({
      id: String(x.id || makeId('cat')), type: ['income', 'expense', 'savings'].includes(x.type) ? x.type : 'expense',
      name: String(x.name || 'Other').slice(0, 60), icon: String(x.icon || '📦').slice(0, 8),
      color: /^#[0-9a-f]{6}$/i.test(x.color) ? x.color : '#64748b', active: x.active !== false
    })) : DEFAULT_CATEGORIES.map(x => ({ ...x }));
    for (const item of DEFAULT_CATEGORIES) {
      if (!categories.some(x => x.id === item.id)) categories.push({ ...item });
    }
    const accounts = Array.isArray(source.accounts) ? source.accounts.filter(x => x && typeof x === 'object').map(x => ({
      id: String(x.id || makeId('acc')), name: String(x.name || 'Account').slice(0, 60),
      type: ['cash', 'bank', 'savings', 'card', 'other'].includes(x.type) ? x.type : 'other',
      openingBalance: Number.isFinite(Number(x.openingBalance)) ? Math.round(Number(x.openingBalance) * 100) / 100 : 0, active: x.active !== false,
      createdAt: String(x.createdAt || new Date().toISOString())
    })) : [];
    if (!accounts.length) accounts.push(seededAccount());
    const currency = CURRENCIES.includes(source.currency) ? source.currency : 'BDT';
    const findOrCreateCategory = (type, name) => {
      const normalizedName = String(name || '').trim();
      let category = categories.find(x => x.type === type && x.name.toLowerCase() === normalizedName.toLowerCase());
      if (!category && normalizedName) {
        category = { id: `cat-${type}-${slug(normalizedName)}`, type, name: normalizedName.slice(0, 60), icon: '📦', color: '#64748b', active: true };
        categories.push(category);
      }
      return category;
    };
    const accountIds = new Set(accounts.map(x => x.id));
    const transactions = (Array.isArray(source.transactions) ? source.transactions : []).filter(x => x && typeof x === 'object').map(x => {
      const type = ['income', 'expense', 'savings', 'transfer'].includes(x.type) ? x.type : 'expense';
      const legacyCategory = String(x.categoryName || x.category || '');
      const category = type === 'transfer' ? null : categories.find(c => c.id === x.categoryId) || findOrCreateCategory(type, legacyCategory || TYPE_NAMES[type]);
      const accountId = accountIds.has(String(x.accountId)) ? String(x.accountId) : accounts[0].id;
      return {
        id: String(x.id || makeId('txn')), type, amount: finiteAmount(x.amount),
        categoryId: category?.id || '', categoryName: category?.name || '',
        accountId, fromAccountId: String(x.fromAccountId || ''),
        toAccountId: String(x.toAccountId || ''), goalId: String(x.goalId || ''),
        itemName: String(x.itemName || '').trim().slice(0, 80),
        note: String(x.note || '').slice(0, 240), date: validDate(x.date) ? x.date : dateFromToday(),
        time: /^\d{2}:\d{2}$/.test(x.time || '') ? x.time : '12:00',
        reminderDate: validDate(x.reminderDate) ? x.reminderDate : '',
        reminderTime: /^\d{2}:\d{2}$/.test(x.reminderTime || '') ? x.reminderTime : '',
        recurringId: String(x.recurringId || ''), createdAt: String(x.createdAt || new Date().toISOString()),
        updatedAt: Number(x.updatedAt) || 0
      };
    }).filter(x => x.amount > 0);
    const recurring = (Array.isArray(source.recurring) ? source.recurring : []).filter(x => x && typeof x === 'object').map(x => ({
      id: String(x.id || makeId('rec')), type: ['income', 'expense', 'savings'].includes(x.type) ? x.type : 'expense',
      amount: finiteAmount(x.amount), categoryId: String(x.categoryId || ''),
      categoryName: String(x.categoryName || ''), itemName: String(x.itemName || '').trim().slice(0, 80), accountId: String(x.accountId || accounts[0].id),
      goalId: String(x.goalId || ''), note: String(x.note || '').slice(0, 240),
      frequency: ['weekly', 'monthly', 'yearly'].includes(x.frequency) ? x.frequency : 'monthly',
      nextDate: validDate(x.nextDate) ? x.nextDate : dateFromToday(), anchorDay: Number(x.anchorDay) || 1,
      reminderEnabled: x.reminderEnabled === true,
      reminderTime: /^\d{2}:\d{2}$/.test(x.reminderTime || '') ? x.reminderTime : '09:00',
      active: x.active !== false, updatedAt: Number(x.updatedAt) || 0
    })).filter(x => x.amount > 0);
    const budgets = (Array.isArray(source.budgets) ? source.budgets : []).filter(x => x && typeof x === 'object').map(x => ({
      id: String(x.id || makeId('budget')), categoryId: String(x.categoryId || ''),
      month: /^\d{4}-\d{2}$/.test(x.month || '') ? x.month : dateFromToday().slice(0, 7),
      limit: finiteAmount(x.limit), updatedAt: Number(x.updatedAt) || 0
    })).filter(x => x.limit > 0);
    const goals = (Array.isArray(source.goals) ? source.goals : []).filter(x => x && typeof x === 'object').map(x => ({
      id: String(x.id || makeId('goal')), name: String(x.name || 'Savings goal').slice(0, 60),
      target: finiteAmount(x.target), openingSaved: finiteAmount(x.openingSaved),
      deadline: validDate(x.deadline) ? x.deadline : '', active: x.active !== false,
      updatedAt: Number(x.updatedAt) || 0
    })).filter(x => x.target > 0);
    const obligations = (Array.isArray(source.obligations) ? source.obligations : []).filter(x => x && typeof x === 'object').map(x => ({
      id: String(x.id || makeId('owed')), type: x.type === 'payable' ? 'payable' : 'receivable',
      contact: String(x.contact || '').trim().slice(0, 80), amount: finiteAmount(x.amount),
      paidAmount: finiteAmount(x.paidAmount), date: validDate(x.date) ? x.date : dateFromToday(),
      dueDate: validDate(x.dueDate) ? x.dueDate : '', note: String(x.note || '').slice(0, 240),
      updatedAt: Number(x.updatedAt) || 0
    })).filter(x => x.contact && x.amount > 0 && x.paidAmount <= x.amount);
    return { schemaVersion: 3, currency, accounts, categories, transactions, recurring, budgets, goals, obligations };
  }
  let api = {};
  let previousFocus = null;
  const ui = { section: 'overview', month: '', txType: 'all', txPeriod: 'six-months', txFrom: '', txTo: '', txCategory: 'all', txAccount: 'all', txSort: 'newest', reportType: 'expense', reportMode: 'month', reportFrom: '', reportTo: '' };
  let reminderTimers = new Map();

  function data() {
    if (!api.getData) return normalize(null);
    const current = api.getData();
    if (!current) api.setData(normalize(null));
    return api.getData();
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function money(value) {
    return currencyFormatter().format(Number(value) || 0);
  }
  function currencyMark() {
    return currencyFormatter().formatToParts(0).find(x=>x.type==='currency')?.value||data().currency;
  }
  function sumMoney(values) {
    return Math.round(values.reduce((sum, value) => sum + Math.round((Number(value) || 0) * 100), 0)) / 100;
  }
  function formatDate(value) {
    if (!validDate(value)) return '';
    return new Intl.DateTimeFormat('en', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`));
  }
  function cutoffDate(today = dateFromToday()) {
    const date = new Date(`${today}T12:00:00Z`);
    const day=date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - 6);
    const lastDay=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    date.setUTCDate(Math.min(day,lastDay));
    return date.toISOString().slice(0, 10);
  }
  function getCategory(id) { return data().categories.find(x => x.id === id); }
  function getAccount(id) { return data().accounts.find(x => x.id === id); }
  function getGoal(id) { return data().goals.find(x => x.id === id); }
  function accountBalances() {
    const balances = Object.fromEntries(data().accounts.map(a => [a.id, Math.round(a.openingBalance * 100)]));
    for (const tx of data().transactions) {
      const cents = Math.round(tx.amount * 100);
      if (tx.type === 'income' && Object.hasOwn(balances, tx.accountId)) balances[tx.accountId] += cents;
      if ((tx.type === 'expense' || tx.type === 'savings') && Object.hasOwn(balances, tx.accountId)) balances[tx.accountId] -= cents;
      if (tx.type === 'transfer') {
        if (Object.hasOwn(balances, tx.fromAccountId)) balances[tx.fromAccountId] -= cents;
        if (Object.hasOwn(balances, tx.toAccountId)) balances[tx.toAccountId] += cents;
      }
    }
    return Object.fromEntries(Object.entries(balances).map(([id, cents]) => [id, cents / 100]));
  }
  function rebaseOldTransaction(tx) {
    const amt = Math.round(tx.amount * 100);
    const account = data().accounts.find(x => x.id === tx.accountId);
    if (tx.type === 'income' && account) account.openingBalance = (Math.round(account.openingBalance * 100) + amt) / 100;
    if ((tx.type === 'expense' || tx.type === 'savings') && account) account.openingBalance = (Math.round(account.openingBalance * 100) - amt) / 100;
    if (tx.type === 'transfer') {
      const from = data().accounts.find(x => x.id === tx.fromAccountId);
      const to = data().accounts.find(x => x.id === tx.toAccountId);
      if (from) from.openingBalance = (Math.round(from.openingBalance * 100) - amt) / 100;
      if (to) to.openingBalance = (Math.round(to.openingBalance * 100) + amt) / 100;
    }
    if (tx.type === 'savings' && tx.goalId) {
      const goal = getGoal(tx.goalId);
      if (goal) goal.openingSaved = (Math.round(goal.openingSaved * 100) + amt) / 100;
    }
  }
  function pruneTransactions() {
    const floor = cutoffDate();
    const expired = data().transactions.filter(x => x.date < floor).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    if (!expired.length) return 0;
    for (const tx of expired) {
      rebaseOldTransaction(tx);
      data().transactions = data().transactions.filter(item => item.id !== tx.id);
    }
    return expired.length;
  }
  function hasMeaningfulData(finance = data()) {
    const value = normalize(finance);
    const defaultAccount = seededAccount();
    const accountChanged = value.accounts.length !== 1 || value.accounts.some(account =>
      account.id !== defaultAccount.id || account.name !== defaultAccount.name ||
      account.type !== defaultAccount.type || account.openingBalance !== defaultAccount.openingBalance ||
      account.active !== defaultAccount.active
    );
    const categoryChanged = value.categories.length !== DEFAULT_CATEGORIES.length || value.categories.some(category => {
      const baseline = DEFAULT_CATEGORIES.find(item => item.id === category.id);
      return !baseline || category.type !== baseline.type || category.name !== baseline.name ||
        category.icon !== baseline.icon || category.color !== baseline.color || category.active !== baseline.active;
    });
    return !!(value.transactions.length || accountChanged || value.budgets.length || value.goals.length ||
      value.recurring.length || value.obligations.length || value.currency !== 'BDT' || categoryChanged);
  }
  function collectSyncEntities(finance) {
    const value = normalize(finance), entities = { 'finance:settings': { currency: value.currency } };
    for (const [kind, list] of [['account', value.accounts], ['category', value.categories], ['transaction', value.transactions], ['recurring', value.recurring], ['budget', value.budgets], ['goal', value.goals], ['obligation', value.obligations]]) {
      for (const item of list) entities[`finance:${kind}:${item.id}`] = structuredClone(item);
    }
    return entities;
  }
  function importLegacy(current, legacy) {
    window.__financeLegacyImportOccurred = true;
    const local = normalize(current), incoming = normalize(legacy);
    const entries = new Map(local.transactions.map(x => [x.id, x]));
    for (const tx of incoming.transactions) if (!entries.has(tx.id)) entries.set(tx.id, tx);
    const accounts = new Map(local.accounts.map(x => [x.id, x]));
    for (const account of incoming.accounts) if (!accounts.has(account.id)) accounts.set(account.id, account);
    const categories = new Map(local.categories.map(x => [x.id, x]));
    for (const category of incoming.categories) if (!categories.has(category.id)) categories.set(category.id, category);
    return normalize({ ...local, accounts: [...accounts.values()], categories: [...categories.values()], transactions: [...entries.values()] });
  }
  function applySyncEntity(current, key, deleted, value) {
    const finance = normalize(current), parts = key.split(':'), kind = parts[1], id = parts.slice(2).join(':');
    if (kind === 'settings') {
      if (!deleted && value && CURRENCIES.includes(value.currency)) finance.currency = value.currency;
      return finance;
    }
    const lists = { account: 'accounts', category: 'categories', transaction: 'transactions', recurring: 'recurring', budget: 'budgets', goal: 'goals', obligation: 'obligations' };
    const listName = lists[kind];
    if (!listName || !id) return finance;
    if (deleted) {
      if (kind === 'account' && finance.transactions.some(x => x.accountId === id || x.fromAccountId === id || x.toAccountId === id)) {
        const account = finance.accounts.find(x => x.id === id);
        if (account && finance.accounts.some(x => x.active && x.id !== id)) account.active = false;
      } else if (kind === 'category' && (finance.transactions.some(x => x.categoryId === id) || finance.recurring.some(x => x.categoryId === id))) {
        const category = finance.categories.find(x => x.id === id); if (category) category.active = false;
      } else finance[listName] = finance[listName].filter(item => item.id !== id);
    }
    else if (value && typeof value === 'object') {
      const incoming = kind === 'transaction' ? normalize({ ...finance, transactions: [value] }).transactions[0] : value;
      if (!incoming || typeof incoming.id !== 'string') return finance;
      const index = finance[listName].findIndex(item => item.id === id);
      if (index < 0) finance[listName].push(structuredClone(incoming));
      else finance[listName][index] = structuredClone(incoming);
    }
    return normalize(finance);
  }

  function dateMonth(value) { return String(value || '').slice(0, 7); }
  function getMonthTransactions(month = ui.month || dateFromToday().slice(0, 7)) {
    return data().transactions.filter(tx => dateMonth(tx.date) === month);
  }
  function totals(transactions) {
    const rows = transactions || [];
    const ofType = type => sumMoney(rows.filter(x => x.type === type).map(x => x.amount));
    return { income: ofType('income'), expense: ofType('expense'), savings: ofType('savings') };
  }
  function goalSaved(goalId) {
    const goal = getGoal(goalId);
    return goal ? sumMoney([goal.openingSaved, ...data().transactions.filter(x => x.type === 'savings' && x.goalId === goalId).map(x => x.amount)]) : 0;
  }
  function accountOptionList(selected = '') {
    return data().accounts.filter(x => x.active).map(x => `<option value="${esc(x.id)}" ${x.id === selected ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  }
  function categoryOptionList(type, selected = '') {
    return `<option value="" disabled ${selected ? '' : 'selected'}>Choose a category</option>`+data().categories.filter(x => x.active && x.type === type).map(x => `<option value="${esc(x.id)}" ${x.id === selected ? 'selected' : ''}>${esc(x.icon)} ${esc(x.name)}</option>`).join('');
  }
  function setSection(section) { ui.section = section; render(); }
  function categoryTypeLabel(type) { return TYPE_NAMES[type] || type; }
  function activeTransactionRange() {
    const today=dateFromToday();let from=ui.txFrom||cutoffDate(),to=ui.txTo||today;
    if (ui.txPeriod === 'today') from = to = today;
    if (ui.txPeriod === 'week') {
      const start = new Date(`${today}T12:00:00Z`);
      start.setUTCDate(start.getUTCDate() - 6);
      from = start.toISOString().slice(0, 10); to = today;
    }
    if (ui.txPeriod === 'month') from = `${today.slice(0, 7)}-01`, to = today;
    if (ui.txPeriod === 'year') from = `${today.slice(0,4)}-01-01`, to = today;
    if (ui.txPeriod === 'six-months') from = cutoffDate(), to = today;
    from = from < cutoffDate() ? cutoffDate() : from;
    return {from,to};
  }
  function filteredTransactions() {
    const {from,to}=activeTransactionRange();
    return data().transactions.filter(x => x.date >= from && x.date <= to &&
      (ui.txType === 'all' || x.type === ui.txType) &&
      (ui.txCategory === 'all' || x.categoryId === ui.txCategory) &&
      (ui.txAccount === 'all' || x.accountId === ui.txAccount || x.fromAccountId === ui.txAccount || x.toAccountId === ui.txAccount))
      .sort((a, b) => {
        if (ui.txSort === 'oldest') return a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
        if (ui.txSort === 'category') return (a.categoryName || '').localeCompare(b.categoryName || '') || b.date.localeCompare(a.date);
        if (ui.txSort === 'amount') return b.amount - a.amount || b.date.localeCompare(a.date);
        return b.date.localeCompare(a.date) || b.time.localeCompare(a.time);
      });
  }
  function txRow(tx) {
    const category = tx.type === 'transfer' ? `${getAccount(tx.fromAccountId)?.name || 'Account'} → ${getAccount(tx.toAccountId)?.name || 'Account'}` : tx.itemName || getCategory(tx.categoryId)?.name || tx.categoryName || TYPE_NAMES[tx.type];
    const detail = tx.type === 'transfer' ? '' : tx.itemName ? getCategory(tx.categoryId)?.name || tx.categoryName || '' : '';
    const sign = tx.type === 'income' ? '+' : tx.type === 'transfer' ? '⇄' : '−';
    return `<article class="fin-tx-row"><div class="fin-tx-icon fin-${tx.type}">${tx.type === 'income' ? '↙' : tx.type === 'expense' ? '↗' : tx.type === 'savings' ? '◎' : '⇄'}</div><div class="fin-tx-main"><b>${esc(category)}</b><small>${detail?`${esc(detail)} · `:''}${esc(formatDate(tx.date))} · ${esc(tx.time)}${tx.note ? ` · ${esc(tx.note)}` : ''}</small></div><div class="fin-tx-value fin-${tx.type}"><b>${sign} ${money(tx.amount)}</b><small>${esc(TYPE_NAMES[tx.type])}</small></div><div class="fin-row-actions"><button class="fin-icon-button" data-action="edit-transaction" data-id="${esc(tx.id)}" aria-label="Edit transaction">✎</button><button class="fin-icon-button" data-action="delete-transaction" data-id="${esc(tx.id)}" aria-label="Delete transaction">×</button></div></article>`;
  }
  function periodSummary(month) {
    const rows = getMonthTransactions(month);
    return totals(rows);
  }
  function renderOverview() {
    const month = ui.month || dateFromToday().slice(0, 7), t = periodSummary(month);
    const balances = accountBalances(), balance = sumMoney(Object.values(balances));
    const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-15T12:00:00Z`));
    const recent = getMonthTransactions(month).sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)).slice(0, 6);
    const budgets = data().budgets.filter(x => x.month === month).slice(0, 3);
    return `<section class="fin-overview">
      <div class="fin-overview-head"><div><span class="fin-eyebrow">PERSONAL FINANCE</span><h2>Money, made clear.</h2><p>See what came in, went out, and what you set aside.</p></div><label class="fin-currency-select">Currency<select data-bind="currency" aria-label="Finance currency">${CURRENCIES.map(c => `<option ${data().currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select><small>Display only · no currency conversion</small></label></div>
      <div class="fin-balance-card${balance<0?' fin-balance-negative':''}"><div><span>${balance<0?'NEGATIVE BALANCE':'AVAILABLE BALANCE'}</span><strong>${money(balance)}</strong><small>${balance<0?'Below zero · ':''}Across ${data().accounts.filter(x => x.active).length} active account${data().accounts.filter(x => x.active).length === 1 ? '' : 's'}</small></div><div class="fin-month-picker"><button data-action="month-step" data-step="-1" aria-label="Previous month">‹</button><label class="fin-month-choice"><span>${esc(monthLabel)}</span><span class="fin-calendar-mark" aria-hidden="true">▦</span><input type="month" value="${esc(month)}" data-bind="month" aria-label="Choose summary month"></label><button data-action="month-step" data-step="1" aria-label="Next month">›</button></div></div>
      <div class="fin-summary-grid"><article class="fin-summary-card"><span>Income</span><b class="fin-green">${money(t.income)}</b><small>in ${esc(monthLabel)}</small></article><article class="fin-summary-card"><span>Expenses</span><b class="fin-red">${money(t.expense)}</b><small>in ${esc(monthLabel)}</small></article><article class="fin-summary-card"><span>Savings</span><b class="fin-blue">${money(t.savings)}</b><small>set aside this month</small></article></div>
      <div class="fin-quick-actions"><button data-action="new-transaction" data-type="income"><i>＋</i><b>Add income</b></button><button data-action="new-transaction" data-type="expense"><i>−</i><b>Add expense</b></button><button data-action="new-transaction" data-type="savings"><i>◇</i><b>Add savings</b></button><button data-action="new-transaction" data-type="transfer"><i>⇄</i><b>Transfer</b></button></div>
      <div class="fin-dashboard-grid"><article class="fin-panel"><div class="fin-panel-head"><div><span class="fin-eyebrow">ACTIVITY</span><h3>Recent transactions</h3></div><button class="fin-text-button" data-action="section" data-section="transactions">View history →</button></div>${recent.length ? recent.map(txRow).join('') : `<div class="fin-empty"><span>🧾</span><b>Your first entry starts here</b><p>Add income, an expense, or savings to see your money story.</p></div>`}</article><article class="fin-panel"><div class="fin-panel-head"><div><span class="fin-eyebrow">PLAN AHEAD</span><h3>Monthly budgets</h3></div><button class="fin-text-button" data-action="section" data-section="budgets">Manage →</button></div>${budgets.length ? budgets.map(budgetCard).join('') : `<div class="fin-empty fin-empty-small"><span>🎯</span><b>Give your money a plan</b><p>Set a spending limit or a savings target.</p><button data-action="section" data-section="budgets">Create a budget</button></div>`}</article></div>
    </section>`;
  }
  function budgetSpent(budget) {
    const category = getCategory(budget.categoryId);
    return category ? sumMoney(getMonthTransactions(budget.month).filter(x => x.type === 'expense' && x.categoryId === category.id).map(x => x.amount)) : 0;
  }
  function budgetCard(budget) {
    const category = getCategory(budget.categoryId), spent = budgetSpent(budget), pct = Math.min(100, Math.round(spent / budget.limit * 100));
    return `<div class="fin-budget-card"><div><span>${esc(category?.icon || '📦')} ${esc(category?.name || 'Category')}</span><b>${money(spent)} / ${money(budget.limit)}</b></div><div class="fin-meter ${spent > budget.limit ? 'over' : ''}"><i style="width:${pct}%"></i></div><small>${spent > budget.limit ? `${money(spent - budget.limit)} over budget` : `${money(budget.limit - spent)} remaining`}</small></div>`;
  }
  function renderTransactions() {
    const rows = filteredTransactions(), floor = cutoffDate();
    const cats = data().categories.filter(x => x.active);
    return `<div class="fin-page-heading"><div><span class="fin-eyebrow">YOUR LEDGER</span><h2>Transactions</h2><p>Search six months of entries and narrow them by date, type, category, or account.</p></div><button class="fin-primary" data-action="new-transaction">＋ New transaction</button></div>
      <div class="fin-period-chips">${[['today','Daily'],['week','Weekly'],['month','Monthly'],['year','Yearly'],['six-months','6 months'],['custom','Custom']].map(([key,label]) => `<button class="${ui.txPeriod === key ? 'active' : ''}" aria-pressed="${ui.txPeriod===key}" data-action="period" data-period="${key}">${label}</button>`).join('')}</div>
      <div class="fin-filter-panel"><label>From<input type="date" value="${esc(activeTransactionRange().from || floor)}" min="${floor}" max="${dateFromToday()}" data-filter="from"></label><label>To<input type="date" value="${esc(activeTransactionRange().to || dateFromToday())}" min="${floor}" max="${dateFromToday()}" data-filter="to"></label><label>Type<select data-filter="type"><option value="all">All types</option>${Object.entries(TYPE_NAMES).map(([k,v]) => `<option value="${k}" ${ui.txType===k?'selected':''}>${v}</option>`).join('')}</select></label><label>Category<select data-filter="category"><option value="all">All categories</option>${cats.map(c => `<option value="${esc(c.id)}" ${ui.txCategory===c.id?'selected':''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select></label><label>Account<select data-filter="account"><option value="all">All accounts</option>${data().accounts.map(a => `<option value="${esc(a.id)}" ${ui.txAccount===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label><label>Sort<select data-filter="sort"><option value="newest" ${ui.txSort==='newest'?'selected':''}>Date newest</option><option value="oldest" ${ui.txSort==='oldest'?'selected':''}>Date oldest</option><option value="category" ${ui.txSort==='category'?'selected':''}>Category</option><option value="amount" ${ui.txSort==='amount'?'selected':''}>Amount high–low</option></select></label></div>
      <div class="fin-panel fin-ledger"><div class="fin-ledger-summary"><b>${rows.length} transaction${rows.length===1?'':'s'}</b><span>Oldest available: ${esc(formatDate(floor))}</span></div>${rows.length ? rows.map(txRow).join('') : `<div class="fin-empty"><span>🔎</span><b>No matching transactions</b><p>Try another date range or clear a filter.</p></div>`}</div>`;
  }
  function rangeTransactions(from, to, type) {
    return data().transactions.filter(tx => tx.date >= from && tx.date <= to && (type === 'all' || tx.type === type));
  }
  function aggregateItems(rows, type) {
    const map = new Map();
    for (const tx of rows.filter(x => x.type === type)) {
      const category=getCategory(tx.categoryId), categoryName=category?.name||tx.categoryName||'Other';
      const label=tx.itemName||categoryName, categoryId=`${tx.categoryId||slug(categoryName)}:${label.trim().toLocaleLowerCase()}`;
      const current = map.get(categoryId) || { id: categoryId, name: label, category: categoryName, icon: category?.icon || '📦', color: category?.color || '#94a3b8', amount: 0, count: 0 };
      current.amount = sumMoney([current.amount, tx.amount]); current.count++; map.set(categoryId, current);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }
  function reportPage() {
    const currentMonth=ui.month||dateFromToday().slice(0,7), monthMode=ui.reportMode==='month';
    const monthEnd=new Date(Date.UTC(Number(currentMonth.slice(0,4)),Number(currentMonth.slice(5,7)),0)).toISOString().slice(0,10);
    const from=monthMode?`${currentMonth}-01`:ui.reportFrom||`${currentMonth}-01`,to=monthMode?(currentMonth===dateFromToday().slice(0,7)?dateFromToday():monthEnd):ui.reportTo||dateFromToday();
    const type = ui.reportType, allRows=rangeTransactions(from,to,'all'), rows=allRows.filter(x=>x.type===type), total = sumMoney(rows.map(x => x.amount));
    const groups = aggregateItems(rows, type);
    const breakdownHeading=type==='expense'?'By product / item':type==='income'?'By income source':'By savings category';
    const rangeControl=monthMode?`<div class="fin-month-picker"><button data-action="month-step" data-step="-1" aria-label="Previous month">‹</button><label class="fin-month-choice"><span>${esc(new Intl.DateTimeFormat('en',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${currentMonth}-15T12:00:00Z`)))}</span><span class="fin-calendar-mark" aria-hidden="true">▦</span><input type="month" value="${esc(currentMonth)}" data-bind="month" aria-label="Choose report month"></label><button data-action="month-step" data-step="1" aria-label="Next month">›</button></div>`:`<div class="fin-report-dates"><label>From<input type="date" value="${esc(from)}" min="${cutoffDate()}" max="${dateFromToday()}" data-report="from"></label><label>To<input type="date" value="${esc(to)}" min="${cutoffDate()}" max="${dateFromToday()}" data-report="to"></label></div>`;
    return `<div class="fin-page-heading"><div><span class="fin-eyebrow">YOUR MONEY STORY</span><h2>Reports</h2><p>Monthly totals, product expenses, and income sources at a glance.</p></div><button class="fin-primary" data-action="print-report">⇧ Save as PDF</button></div>
      <div class="fin-report-toolbar"><div class="fin-report-mode" role="group" aria-label="Report date range"><button class="${monthMode?'active':''}" aria-pressed="${monthMode}" data-action="report-mode" data-mode="month">Monthly</button><button class="${!monthMode?'active':''}" aria-pressed="${!monthMode}" data-action="report-mode" data-mode="custom">Custom range</button></div>${rangeControl}</div>
      <div class="fin-report-controls"><div class="fin-period-chips" role="group" aria-label="Report transaction type">${['expense','income','savings'].map(k=>`<button class="${type===k?'active':''}" aria-pressed="${type===k}" data-action="report-type" data-type="${k}">${TYPE_NAMES[k]}</button>`).join('')}</div></div>
      <section class="fin-report-summary fin-report-hero fin-report-${type}"><span>${esc(formatDate(from))} — ${esc(formatDate(to))}</span><strong>${money(total)}</strong><small>Total ${esc(TYPE_NAMES[type].toLowerCase())} · ${rows.length} ${rows.length===1?'entry':'entries'}</small></section>
      <div class="fin-report-grid">
        <article class="fin-panel fin-breakdown-panel fin-report-${type}">
          <div class="fin-panel-head"><div><span class="fin-eyebrow">${type==='expense'?'EXPENSE BREAKDOWN':type==='income'?'INCOME BREAKDOWN':'SAVINGS BREAKDOWN'}</span><h3>${breakdownHeading}</h3></div><span class="fin-monthly-count">${groups.length} ${type==='expense'?(groups.length===1?'product':'products'):type==='income'?(groups.length===1?'source':'sources'):(groups.length===1?'category':'categories')}</span></div>
          ${groups.length?groups.map(item=>{const share=total?Math.round(item.amount/total*100):0;return `<div class="fin-breakdown-row"><div class="fin-breakdown-main"><span class="fin-breakdown-icon">${esc(item.icon)}</span><div class="fin-breakdown-label"><b>${esc(item.name)}</b>${item.category&&item.category!==item.name?`<small>${esc(item.category)}</small>`:''}</div><strong>${money(item.amount)}</strong></div><div class="fin-breakdown-share"><small>Share of ${esc(type)} <b>${share}%</b></small><div class="fin-breakdown-track" role="meter" aria-label="${esc(item.name)} share" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${share}"><i style="width:${share}%"></i></div></div></div>`}).join(''):`<div class="fin-empty fin-empty-small"><b>No ${esc(type)} in this period</b><p>Entries you add for these dates will appear here.</p></div>`}
        </article>
        <article class="fin-panel fin-cashflow-panel"><div class="fin-panel-head"><div><span class="fin-eyebrow">CASH FLOW</span><h3>Period overview</h3></div></div><p class="fin-panel-description">All money in and out during these dates.</p>${[['income','Income'],['expense','Expenses'],['savings','Savings']].map(([kind,label])=>`<div class="fin-flow-row"><span>${label}</span><b class="fin-${kind}">${money(sumMoney(allRows.filter(x=>x.type===kind).map(x=>x.amount)))}</b></div>`).join('')}</article>
      </div>
      <div id="financePrint" class="fin-print-only">${printReportMarkup(from,to,type,allRows,groups,total)}</div>`;
  }
  function printReportMarkup(from, to, type, rows, groups, total) {
    return `<h1>Japan Lock-In · Finance report</h1><p>${esc(TYPE_NAMES[type])} · ${esc(formatDate(from))} — ${esc(formatDate(to))} · ${esc(data().currency)}</p><h2>Total ${money(total)}</h2><h3>${type==='expense'?'Product totals':type==='income'?'Income source totals':'Savings category totals'}</h3><table><thead><tr><th>${type==='expense'?'Product / item':type==='income'?'Income source':'Category'}</th><th>Transactions</th><th>Amount</th><th>Share</th></tr></thead><tbody>${groups.map(g=>`<tr><td>${esc(g.name)}${g.category&&g.category!==g.name?` (${esc(g.category)})`:''}</td><td>${g.count}</td><td>${esc(money(g.amount))}</td><td>${total?Math.round(g.amount/total*100):0}%</td></tr>`).join('')}</tbody></table><h3>Transactions</h3><table><thead><tr><th>Date</th><th>Product / source</th><th>Note</th><th>Amount</th></tr></thead><tbody>${rows.filter(x=>x.type===type).sort((a,b)=>a.date.localeCompare(b.date)).map(tx=>`<tr><td>${esc(formatDate(tx.date))}</td><td>${esc(tx.itemName || getCategory(tx.categoryId)?.name || tx.categoryName || getAccount(tx.accountId)?.name || '')}</td><td>${esc(tx.note)}</td><td>${esc(money(tx.amount))}</td></tr>`).join('')}</tbody></table>`;
  }
  function budgetPage() {
    const month = ui.month || dateFromToday().slice(0,7), budgets = data().budgets.filter(x=>x.month===month);
    const goals = data().goals.filter(x=>x.active);
    return `<div class="fin-page-heading"><div><span class="fin-eyebrow">MAKE A PLAN</span><h2>Budgets & savings goals</h2><p>Keep spending intentional and track what you’re saving toward.</p></div><button class="fin-primary" data-action="new-budget">＋ Add budget</button></div>
      <div class="fin-subheading"><h3>Monthly category budgets</h3><label>${esc(month)}<input type="month" value="${esc(month)}" data-bind="month"></label></div>${budgets.length?budgets.map(b=>`<div class="fin-budget-wrap">${budgetCard(b)}<div class="fin-inline-actions"><button class="fin-text-button" data-action="edit-budget" data-id="${esc(b.id)}">Edit</button><button class="fin-text-button fin-delete-link" data-action="delete-budget" data-id="${esc(b.id)}">Delete</button></div></div>`).join(''):`<article class="fin-panel fin-empty"><span>📊</span><b>No budgets for ${esc(month)}</b><p>Set a limit for a spending category.</p><button data-action="new-budget">Set first budget</button></article>`}
      <div class="fin-subheading fin-goals-heading"><div><h3>Savings goals</h3><p>Contributions are tracked separately from expenses.</p></div><button class="fin-secondary" data-action="new-goal">＋ New goal</button></div>
      ${goals.length?`<div class="fin-goals-grid">${goals.map(g=>{const saved=goalSaved(g.id),pct=Math.min(100,Math.round(saved/g.target*100));return `<article class="fin-panel fin-goal"><div class="fin-panel-head"><div><span class="fin-eyebrow">SAVINGS GOAL</span><h3>${esc(g.name)}</h3></div><div><button class="fin-icon-button" data-action="edit-goal" data-id="${esc(g.id)}" aria-label="Edit ${esc(g.name)}">✎</button><button class="fin-icon-button" data-action="delete-goal" data-id="${esc(g.id)}" aria-label="Delete ${esc(g.name)}">×</button></div></div><div class="fin-goal-amount"><b>${money(saved)}</b><span>of ${money(g.target)}</span></div><div class="fin-meter"><i style="width:${pct}%"></i></div><small>${pct}%${g.deadline?` · Target ${esc(formatDate(g.deadline))}`:''}</small><button class="fin-text-button" data-action="new-transaction" data-type="savings" data-goal="${esc(g.id)}">＋ Add contribution</button></article>`}).join('')}</div>`:`<article class="fin-panel fin-empty"><span>🌱</span><b>Give a goal a name</b><p>Track an emergency fund, a trip, or another savings target.</p><button data-action="new-goal">Create savings goal</button></article>`}
      <div class="fin-subheading fin-goals-heading"><div><h3>Recurring entries</h3><p>Due entries are added once when you open or return to the app.</p></div><button class="fin-secondary" data-action="request-reminders">Enable reminders</button></div>
      ${data().recurring.length?`<div class="fin-recurring-list">${data().recurring.map(r=>`<article class="fin-panel fin-recurring-row"><div><b>${esc(r.categoryName||TYPE_NAMES[r.type])} · ${money(r.amount)}</b><small>${esc(r.frequency)} · next ${esc(formatDate(r.nextDate))}${r.reminderEnabled?' · reminder on':''}</small></div><div><button class="fin-text-button" data-action="toggle-recurring" data-id="${esc(r.id)}">${r.active?'Pause':'Resume'}</button><button class="fin-text-button fin-delete-link" data-action="delete-recurring" data-id="${esc(r.id)}">Delete</button></div></article>`).join('')}</div>`:`<p class="muted">Mark an entry as recurring when you add it to see it here.</p>`}`;
  }
  function categoriesPage() {
    const categories = data().categories.filter(x=>x.active), types=['expense','income','savings'];
    return `<div class="fin-page-heading"><div><span class="fin-eyebrow">YOUR LABELS</span><h2>Categories</h2><p>Organize income, spending, and savings your way.</p></div><button class="fin-primary" data-action="new-category">＋ Add category</button></div>${types.map(type=>`<article class="fin-panel fin-categories-panel"><div class="fin-panel-head"><div><span class="fin-eyebrow">${esc(TYPE_NAMES[type])}</span><h3>${type==='expense'?'Where money goes':type==='income'?'Where money comes from':'What you are saving for'}</h3></div><button class="fin-text-button" data-action="new-category" data-type="${type}">＋ Add</button></div><div class="fin-category-grid">${categories.filter(x=>x.type===type).map(c=>`<div class="fin-category-chip"><span style="background:${esc(c.color)}">${esc(c.icon)}</span><b>${esc(c.name)}</b><button class="fin-icon-button" data-action="edit-category" data-id="${esc(c.id)}" aria-label="Edit ${esc(c.name)}">✎</button><button class="fin-icon-button" data-action="delete-category" data-id="${esc(c.id)}" aria-label="Archive ${esc(c.name)}">×</button></div>`).join('')||'<p class="muted">No categories yet.</p>'}</div></article>`).join('')}`;
  }
  function accountsPage() {
    const balances=accountBalances();
    return `<div class="fin-page-heading"><div><span class="fin-eyebrow">WHERE YOU KEEP MONEY</span><h2>Accounts</h2><p>Cash, bank, and savings accounts share one currency: ${esc(data().currency)}.</p></div><button class="fin-primary" data-action="new-account">＋ Add account</button></div><div class="fin-accounts-grid">${data().accounts.filter(a=>a.active).map(a=>`<article class="fin-panel fin-account"><div class="fin-account-icon">${a.type==='cash'?'💵':a.type==='bank'?'🏦':a.type==='savings'?'🐷':a.type==='card'?'💳':'◉'}</div><div class="fin-panel-head"><div><span class="fin-eyebrow">${esc(a.type.toUpperCase())} ACCOUNT</span><h3>${esc(a.name)}</h3></div><button class="fin-icon-button" data-action="edit-account" data-id="${esc(a.id)}" aria-label="Edit ${esc(a.name)}">✎</button></div><strong>${money(balances[a.id]||0)}</strong><small>Opening balance ${money(a.openingBalance)}</small><button class="fin-text-button fin-delete-link" data-action="delete-account" data-id="${esc(a.id)}">Delete or archive</button></article>`).join('')}</div><article class="fin-panel fin-transfer-explainer"><b>Move money without changing your total</b><p>Transfers reduce one account and increase another. They are not counted as income or expenses.</p><button class="fin-secondary" data-action="new-transaction" data-type="transfer">⇄ Transfer between accounts</button></article>`;
  }
  function outstanding(obligation) { return Math.max(0, Math.round((obligation.amount - obligation.paidAmount) * 100) / 100); }
  function obligationRow(item) {
    const left=outstanding(item),overdue=left>0&&item.dueDate&&item.dueDate<dateFromToday();
    return `<article class="fin-obligation-row"><div class="fin-obligation-main"><b>${esc(item.contact)}</b><small>${item.dueDate?`Due ${esc(formatDate(item.dueDate))}`:'No due date'}${item.note?` · ${esc(item.note)}`:''}</small></div><div class="fin-obligation-value"><b class="${item.type==='receivable'?'fin-green':'fin-red'}">${money(left)}</b><small class="${overdue?'fin-overdue':''}">${left===0?'Settled':overdue?'Overdue':`of ${money(item.amount)}`}</small></div><div class="fin-row-actions">${left>0?`<button class="fin-icon-button" data-action="settle-obligation" data-id="${esc(item.id)}" aria-label="${item.type==='receivable'?'Record collection':'Record payment'}">↗</button>`:''}<button class="fin-icon-button" data-action="edit-obligation" data-id="${esc(item.id)}" aria-label="Edit ${esc(item.contact)}">✎</button><button class="fin-icon-button" data-action="delete-obligation" data-id="${esc(item.id)}" aria-label="Delete ${esc(item.contact)}">×</button></div></article>`;
  }
  function obligationSection(type,label,description) {
    const entries=data().obligations.filter(x=>x.type===type).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.contact.localeCompare(b.contact));
    const total=sumMoney(entries.map(outstanding));
    return `<article class="fin-panel fin-obligations-panel"><div class="fin-panel-head"><div><span class="fin-eyebrow">${type==='receivable'?'MONEY OWED TO YOU':'MONEY YOU OWE'}</span><h3>${label}</h3><p>${description}</p></div><button class="fin-secondary" data-action="new-obligation" data-type="${type}">＋ Add</button></div><div class="fin-obligation-total"><span>Outstanding</span><b class="${type==='receivable'?'fin-green':'fin-red'}">${money(total)}</b></div>${entries.length?entries.map(obligationRow).join(''):`<div class="fin-empty fin-empty-small"><b>No ${label.toLowerCase()} yet</b><p>Track money ${type==='receivable'?'customers or people owe you':'you need to pay'}.</p></div>`}</article>`;
  }
  function receivablesPage() {
    return `<div class="fin-page-heading"><div><span class="fin-eyebrow">MONEY TO TRACK</span><h2>Receivables & Payables</h2><p>Keep track of amounts owed to you and amounts you need to pay. Record full or partial payments when they happen.</p></div></div><div class="fin-obligations-grid">${obligationSection('receivable','Accounts receivable','Money customers or people owe you.')}${obligationSection('payable','Accounts payable','Bills or money you owe to others.')}</div><p class="fin-form-help">Recording a collection adds income; recording a payment adds an expense to your ledger and updates the account balance.</p>`;
  }
  function render() {
    const el=document.getElementById('finance'); if(!el) return;
    if(!ui.month) ui.month=dateFromToday().slice(0,7);
    const navGroups=[
      {label:'Money',sections:[['overview','Overview'],['transactions','Transactions'],['reports','Reports']]},
      {label:'Planning & accounts',sections:[['budgets','Budgets'],['categories','Categories'],['accounts','Accounts'],['receivables','Receivables']]}
    ];
    const body={overview:renderOverview,transactions:renderTransactions,reports:reportPage,budgets:budgetPage,categories:categoriesPage,accounts:accountsPage,receivables:receivablesPage}[ui.section]();
    el.innerHTML=`<div class="fin-app"><header class="fin-header"><div><span class="fin-mark">${esc(currencyMark())}</span><div><span class="fin-eyebrow">FINANCE</span><h1>Income & Expense</h1></div></div><span class="fin-local-status" id="financeSyncHint">● Saved on this device</span></header><nav class="fin-nav" aria-label="Finance sections">${navGroups.map(group=>`<div class="fin-nav-group"><span class="fin-nav-heading">${group.label}</span><div class="fin-nav-buttons fin-nav-buttons-${group.sections.length}">${group.sections.map(([key,label])=>`<button class="${ui.section===key?'active':''}" data-action="section" data-section="${key}">${label}</button>`).join('')}</div></div>`).join('')}</nav><main>${body}</main><footer class="fin-footnote">Your ledger is stored on this device and included in cloud sync when paired. Older entries than six months are removed automatically.</footer><div id="financeDialogHost"></div></div>`;
    const hint=document.getElementById('financeSyncHint');
    if(hint) hint.textContent=window.navigator.onLine===false?'● Saved locally · offline':'● Saved locally · cloud sync follows app settings';
  }
  function dialog(title, body, submit='Save') {
    const host=document.getElementById('financeDialogHost');
    if(!host) return;
    previousFocus=document.activeElement;
    host.innerHTML=`<div class="fin-dialog-backdrop"><section class="fin-dialog" role="dialog" aria-modal="true" aria-labelledby="finDialogTitle"><header><h2 id="finDialogTitle">${esc(title)}</h2><button type="button" class="fin-icon-button" data-action="close-dialog" aria-label="Close">×</button></header><div class="fin-dialog-body">${body}</div><footer><button type="button" class="fin-secondary" data-action="close-dialog">Cancel</button><button type="submit" form="finModalForm" class="fin-primary">${esc(submit)}</button></footer></section></div>`;
    const first=host.querySelector('#finAmount')||host.querySelector('input:not([type=hidden]),select,button');
    host.querySelector('.fin-dialog')?.addEventListener('keydown',event=>{
      if(event.key==='Escape') { event.preventDefault(); closeDialog(); }
      if(event.key==='Tab') {
        const focusable=[...host.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')];
        if(!focusable.length) return;
        if(event.shiftKey&&document.activeElement===focusable[0]){event.preventDefault();focusable[focusable.length-1].focus()}
        else if(!event.shiftKey&&document.activeElement===focusable[focusable.length-1]){event.preventDefault();focusable[0].focus()}
      }
    });
    host.querySelector('.fin-dialog-backdrop')?.addEventListener('click',event=>{if(event.target===event.currentTarget)closeDialog()});
    document.body.classList.add('fin-dialog-open');
    updateDialogViewport();
    first?.focus();
    requestAnimationFrame(updateDialogViewport);
  }
  function updateDialogViewport() {
    const backdrop=document.querySelector('#financeDialogHost .fin-dialog-backdrop');
    if(!backdrop)return;
    const viewport=window.visualViewport;
    backdrop.style.setProperty('--fin-visual-height',`${Math.max(1,viewport?.height||window.innerHeight)}px`);
    backdrop.style.setProperty('--fin-visual-top',`${Math.max(0,viewport?.offsetTop||0)}px`);
  }
  function closeDialog() {
    const host=document.getElementById('financeDialogHost');if(host)host.innerHTML='';
    document.body.classList.remove('fin-dialog-open');
    if(previousFocus?.isConnected)previousFocus.focus();
    previousFocus=null;
  }
  function entryForm(type='expense', tx=null, goalId='', draft=null) {
    const record=tx||draft||{}, effectiveType=record.type||type, goalOptions=data().goals.filter(x=>x.active).map(g=>`<option value="${esc(g.id)}" ${g.id===(record.goalId||goalId)?'selected':''}>${esc(g.name)}</option>`).join('');
    const cats=categoryOptionList(effectiveType,record.categoryId);
    const transfers=effectiveType==='transfer';
    const body=`<form id="finModalForm" data-form="transaction" data-id="${esc(record.id||'')}"><div class="fin-type-switch" role="group" aria-label="Transaction type">${['income','expense','savings','transfer'].map(k=>`<button type="button" data-action="entry-type" data-type="${k}" class="${effectiveType===k?'active':''}" aria-pressed="${effectiveType===k}">${TYPE_NAMES[k]}</button>`).join('')}</div><div class="fin-amount-field"><label for="finAmount">Amount</label><div><span>${esc(data().currency)}</span><input id="finAmount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" value="${record.amount?esc(record.amount):''}" placeholder="0.00" required></div></div>
      ${transfers?`<div class="fin-form-grid"><label>From account<select name="fromAccountId" required>${accountOptionList(record.fromAccountId)}</select></label><label>To account<select name="toAccountId" required>${accountOptionList(record.toAccountId)}</select></label></div>`:`<div class="fin-form-grid"><label>Category<select name="categoryId" required>${cats}</select></label><label>Account<select name="accountId" required>${accountOptionList(record.accountId)}</select></label>${effectiveType==='savings'?`<label class="fin-full-field">Savings goal<select name="goalId"><option value="">General savings</option>${goalOptions}</select></label>`:''}</div>`}
      ${!transfers?`<label>${effectiveType==='income'?'Income source (optional)':effectiveType==='expense'?'Product / item (optional)':'Savings name (optional)'}<input name="itemName" maxlength="80" value="${esc(record.itemName||'')}" placeholder="${effectiveType==='income'?'e.g. Salary, freelance, or client':'e.g. Rice, transport, or electricity'}"></label>`:''}<div class="fin-form-grid"><label>Date<input name="date" type="date" min="${cutoffDate()}" max="${dateFromToday()}" value="${esc(record.date||dateFromToday())}" required></label><label>Time<input name="time" type="time" value="${esc(record.time||timeFromNow())}" required></label></div><label>Note<input name="note" maxlength="240" value="${esc(record.note||'')}" placeholder="Optional additional note"></label>
      ${!tx&&effectiveType!=='transfer'?`<div class="fin-options"><label><input name="recurring" type="checkbox"> Repeat this entry</label><label><input name="reminderEnabled" type="checkbox"> Remind me</label></div><div class="fin-form-grid fin-conditional-options hidden" data-recurrence><label>Repeat every<select name="frequency"><option value="weekly">Week</option><option value="monthly" selected>Month</option><option value="yearly">Year</option></select></label><label class="fin-recurring-reminder hidden">Reminder time<input name="recurringReminderTime" type="time" value="09:00"></label></div><div class="fin-form-grid fin-conditional-options hidden" data-once-reminder><label>Reminder date<input name="reminderDate" type="date" min="${dateFromToday()}" value="${esc(record.reminderDate||dateFromToday())}"></label><label>Reminder time<input name="reminderTime" type="time" value="${esc(record.reminderTime||'09:00')}"></label></div>`:''}
      <p class="fin-form-help">${effectiveType==='transfer'?'Transfers move funds between accounts without changing income, expense, or savings totals.':effectiveType==='savings'?'Savings are tracked separately and reduce the available account balance, not the expense total.':'Your entry is saved locally immediately and syncs when this device is connected.'}</p></form>`;
    dialog(tx?'Edit transaction':`Add ${TYPE_NAMES[effectiveType].toLowerCase()}`,body,tx?'Save changes':'Save entry');
    syncEntryOptionVisibility();
  }
  function syncEntryOptionVisibility() {
    const form=document.getElementById('finModalForm'); if(!form)return;
    const recurrence=form.elements.namedItem('recurring'),reminder=form.elements.namedItem('reminderEnabled');
    form.querySelector('[data-recurrence]')?.classList.toggle('hidden',!recurrence?.checked);
    form.querySelector('[data-once-reminder]')?.classList.toggle('hidden',!reminder?.checked||recurrence?.checked);
    form.querySelector('.fin-recurring-reminder')?.classList.toggle('hidden',!reminder?.checked);
  }
  function submitEntry(form) {
    const fd=new FormData(form),type=form.querySelector('.fin-type-switch .active')?.dataset.type||'expense';
    const amount=Number(fd.get('amount')),date=String(fd.get('date')||''),floor=cutoffDate();
    if(!Number.isFinite(amount)||amount<=0) return alert('Enter an amount greater than zero.');
    if(!validDate(date)||date<floor||date>dateFromToday()) return alert(`Choose a date between ${formatDate(floor)} and today.`);
    const id=form.dataset.id;
    if(type==='transfer') {
      const from=String(fd.get('fromAccountId')||''),to=String(fd.get('toAccountId')||'');
      if(!from||!to||from===to)return alert('Choose two different accounts for a transfer.');
      upsert('transactions',{id:id||makeId('txn'),type,amount:finiteAmount(amount),fromAccountId:from,toAccountId:to,accountId:'',categoryId:'',categoryName:'Transfer',goalId:'',note:String(fd.get('note')||'').slice(0,240),date,time:String(fd.get('time')||timeFromNow()),createdAt:id?findById('transactions',id)?.createdAt:new Date().toISOString(),updatedAt:Date.now()});
    } else {
      const category=getCategory(String(fd.get('categoryId')||''));
      if(!category||category.type!==type) return alert('Choose a valid category for this entry.');
      const tx={id:id||makeId('txn'),type,amount:finiteAmount(amount),categoryId:category.id,categoryName:category.name,itemName:String(fd.get('itemName')||'').trim().slice(0,80),accountId:String(fd.get('accountId')||''),fromAccountId:'',toAccountId:'',goalId:String(fd.get('goalId')||''),note:String(fd.get('note')||'').slice(0,240),date,time:String(fd.get('time')||timeFromNow()),reminderDate:'',reminderTime:'',createdAt:id?findById('transactions',id)?.createdAt:new Date().toISOString(),updatedAt:Date.now()};
      if(!tx.accountId||!getAccount(tx.accountId))return alert('Choose an account for this entry.');
      if(!id&&fd.get('reminderEnabled')==='on'){tx.reminderDate=String(fd.get('reminderDate')||date);tx.reminderTime=String(fd.get('reminderTime')||'09:00');if(api.requestNotifications)api.requestNotifications();}
      upsert('transactions',tx);
      if(!id&&fd.get('recurring')==='on') {
        data().recurring.push({id:makeId('rec'),type,amount:tx.amount,categoryId:category.id,categoryName:category.name,itemName:tx.itemName,accountId:tx.accountId,goalId:tx.goalId,note:tx.note,frequency:String(fd.get('frequency')||'monthly'),nextDate:advanceDate(date,String(fd.get('frequency')||'monthly'),Number(date.slice(8,10))),anchorDay:Number(date.slice(8,10)),reminderEnabled:fd.get('reminderEnabled')==='on',reminderTime:String(fd.get('recurringReminderTime')||'09:00'),active:true,updatedAt:Date.now()});
      }
    }
    pruneTransactions(); commit(); closeDialog(); render();
  }
  function advanceDate(date, frequency, anchorDay) {
    const d=new Date(`${date}T12:00:00Z`);
    if(frequency==='weekly'){d.setUTCDate(d.getUTCDate()+7);return d.toISOString().slice(0,10)}
    const originalDay=Math.max(1,Number(anchorDay)||d.getUTCDate());
    if(frequency==='yearly')d.setUTCFullYear(d.getUTCFullYear()+1);
    else d.setUTCMonth(d.getUTCMonth()+1);
    const lastDay=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
    d.setUTCDate(Math.min(originalDay,lastDay));
    return d.toISOString().slice(0,10);
  }
  function processDue() {
    if(!api.getData) return;
    const today=dateFromToday(), floor=cutoffDate(); let changed=false, generated=0;
    for(const rule of data().recurring.filter(x=>x.active)) {
      let guard=0;
      while(rule.nextDate<=today&&guard++<2000) {
        const occurrenceDate=rule.nextDate;
        const id=`occ-${rule.id}-${occurrenceDate}`;
        if(occurrenceDate>=floor&&!data().transactions.some(x=>x.id===id)) {
          data().transactions.push({id,type:rule.type,amount:rule.amount,categoryId:rule.categoryId,categoryName:rule.categoryName,itemName:rule.itemName,accountId:rule.accountId,fromAccountId:'',toAccountId:'',goalId:rule.goalId,note:rule.note,date:occurrenceDate,time:rule.reminderTime||'09:00',reminderDate:'',reminderTime:'',recurringId:rule.id,createdAt:new Date().toISOString(),updatedAt:Date.now()});
          generated++; changed=true;
        } else if(occurrenceDate<floor) {
          rebaseOldTransaction({type:rule.type,amount:rule.amount,accountId:rule.accountId,fromAccountId:'',toAccountId:'',goalId:rule.goalId});
          changed=true;
        }
        rule.nextDate=advanceDate(rule.nextDate,rule.frequency,rule.anchorDay);
        rule.updatedAt=Date.now(); changed=true;
      }
    }
    if(pruneTransactions()) changed=true;
    if(changed){commit();scheduleBrowserReminders()}
    return generated;
  }
  function findById(list,id) { return data()[list].find(x=>x.id===id); }
  function upsert(list,item) {
    const i=data()[list].findIndex(x=>x.id===item.id);
    if(i<0)data()[list].push(item);else data()[list][i]=item;
  }
  function commit() {
    if(!api.save)return;
    api.save(); if(api.syncNow)api.syncNow(); scheduleBrowserReminders();
  }
  function categoryForm(item=null,type='expense') {
    const category=item||{};
    dialog(item?'Edit category':'Create category',`<form id="finModalForm" data-form="category" data-id="${esc(category.id||'')}"><label>Name<input name="name" required maxlength="60" value="${esc(category.name||'')}" placeholder="e.g. Groceries"></label><div class="fin-form-grid"><label>Used for<select name="type" ${item?'disabled':''}>${['expense','income','savings'].map(k=>`<option value="${k}" ${(category.type||type)===k?'selected':''}>${TYPE_NAMES[k]}</option>`).join('')}</select></label><label>Icon<input name="icon" maxlength="4" value="${esc(category.icon||'📦')}"></label></div><label>Color<input name="color" type="color" value="${esc(category.color||'#64748b')}"></label><p class="fin-form-help">Categories already used by entries can be archived, but their history is preserved.</p></form>`,item?'Save category':'Create category');
  }
  function accountForm(item=null) {
    const account=item||{};
    dialog(item?'Edit account':'Add account',`<form id="finModalForm" data-form="account" data-id="${esc(account.id||'')}"><label>Account name<input name="name" required maxlength="60" value="${esc(account.name||'')}" placeholder="e.g. Main bank"></label><div class="fin-form-grid"><label>Account type<select name="type">${[['cash','Cash'],['bank','Bank'],['savings','Savings'],['card','Card'],['other','Other']].map(([k,v])=>`<option value="${k}" ${(account.type||'cash')===k?'selected':''}>${v}</option>`).join('')}</select></label><label>Opening balance<input name="openingBalance" type="number" step="0.01" value="${esc(account.openingBalance??0)}" required></label></div><p class="fin-form-help">Opening balance is the account value before the six-month transaction window.</p></form>`,item?'Save account':'Create account');
  }
  function budgetForm(item=null) {
    const month=item?.month||ui.month||dateFromToday().slice(0,7);
    dialog(item?'Edit budget':'Set monthly budget',`<form id="finModalForm" data-form="budget" data-id="${esc(item?.id||'')}"><label>Expense category<select name="categoryId" required>${categoryOptionList('expense',item?.categoryId)}</select></label><div class="fin-form-grid"><label>Monthly limit<input name="limit" type="number" min="0.01" step="0.01" value="${esc(item?.limit||'')}" required></label><label>Month<input name="month" type="month" value="${esc(month)}" required></label></div></form>`,item?'Save budget':'Save budget');
  }
  function goalForm(item=null) {
    dialog(item?'Edit savings goal':'Create savings goal',`<form id="finModalForm" data-form="goal" data-id="${esc(item?.id||'')}"><label>Goal name<input name="name" maxlength="60" required value="${esc(item?.name||'')}" placeholder="e.g. Emergency fund"></label><div class="fin-form-grid"><label>Target amount<input name="target" type="number" min="0.01" step="0.01" value="${esc(item?.target||'')}" required></label><label>Target date (optional)<input name="deadline" type="date" min="${dateFromToday()}" value="${esc(item?.deadline||'')}"></label></div></form>`,item?'Save goal':'Create goal');
  }
  function obligationForm(item=null,type='receivable') {
    const record=item||{};
    dialog(item?'Edit receivable / payable':type==='receivable'?'Add account receivable':'Add account payable',`<form id="finModalForm" data-form="obligation" data-id="${esc(record.id||'')}"><input type="hidden" name="type" value="${esc(record.type||type)}"><label>${record.type==='payable'||type==='payable'?'Payee / creditor':'Customer / person who owes you'}<input name="contact" maxlength="80" required value="${esc(record.contact||'')}" placeholder="${type==='payable'?'e.g. Landlord or utility provider':'e.g. Customer name'}"></label><div class="fin-form-grid"><label>Total amount<input name="amount" type="number" min="0.01" step="0.01" value="${esc(record.amount||'')}" required></label><label>Due date (optional)<input name="dueDate" type="date" value="${esc(record.dueDate||'')}"></label></div><label>Note<input name="note" maxlength="240" value="${esc(record.note||'')}" placeholder="Invoice, bill, or other details"></label><p class="fin-form-help">Adding this record only tracks the amount owed. Your account balance changes when you record a collection or payment.</p></form>`,item?'Save changes':'Add to ledger');
  }
  function settleObligationForm(item) {
    const left=outstanding(item),incoming=item.type==='receivable';
    dialog(incoming?'Record collection':'Record payment',`<form id="finModalForm" data-form="settlement" data-id="${esc(item.id)}"><p><b>${esc(item.contact)}</b> · ${incoming?'owed to you':'you owe'} ${money(left)}</p><label>${incoming?'Amount received':'Payment amount'}<input name="amount" type="number" min="0.01" max="${esc(left)}" step="0.01" value="${esc(left)}" required></label><label>${incoming?'Deposit to':'Pay from'} account<select name="accountId" required>${accountOptionList(data().accounts.find(x=>x.active)?.id||'')}</select></label><p class="fin-form-help">This payment is dated automatically using the app’s current system time setting. You can record a partial amount; the remaining balance will stay open.</p></form>`,incoming?'Record collection':'Record payment');
  }
  function editTransaction(id) { const tx=findById('transactions',id); if(tx)entryForm(tx.type,tx); }
  function deleteTransaction(id) {
    const tx=findById('transactions',id); if(!tx)return;
    if(!confirm('Delete this transaction? This cannot be undone.'))return;
    data().transactions=data().transactions.filter(x=>x.id!==id);commit();render();
  }
  function editCategory(id) { const category=getCategory(id);if(category)categoryForm(category); }
  function deleteCategory(id) {
    const category=getCategory(id);if(!category)return;
    const used=data().transactions.some(x=>x.categoryId===id)||data().recurring.some(x=>x.categoryId===id)||data().budgets.some(x=>x.categoryId===id);
    if(used){category.active=false;category.updatedAt=Date.now();commit();render();return}
    if(!confirm(`Delete ${category.name}?`))return;
    data().categories=data().categories.filter(x=>x.id!==id);commit();render();
  }
  function editAccount(id) { const account=getAccount(id);if(account)accountForm(account); }
  function deleteAccount(id) {
    const account=getAccount(id);if(!account)return;
    if(account.active&&data().accounts.filter(x=>x.active).length<2)return alert('Keep at least one active account.');
    const used=data().transactions.some(x=>x.accountId===id||x.fromAccountId===id||x.toAccountId===id)||data().recurring.some(x=>x.accountId===id);
    if(used){account.active=false;account.updatedAt=Date.now();commit();render();return}
    if(!confirm(`Delete ${account.name}?`))return;
    data().accounts=data().accounts.filter(x=>x.id!==id);commit();render();
  }
  function saveForm(form) {
    const fd=new FormData(form), id=form.dataset.id;
    if(form.dataset.form==='transaction')return submitEntry(form);
    if(form.dataset.form==='category') {
      const type=String(fd.get('type')||getCategory(id)?.type||'expense'),name=String(fd.get('name')||'').trim(),icon=String(fd.get('icon')||'📦').trim(),color=String(fd.get('color')||'#64748b');
      if(!name)return alert('Enter a category name.');
      if(data().categories.some(x=>x.type===type&&x.name.toLowerCase()===name.toLowerCase()&&x.id!==id))return alert('A category with that name already exists.');
      const item={id:id||makeId('cat'),type,name,icon,color,active:true,updatedAt:Date.now()};upsert('categories',item);commit();closeDialog();render();return;
    }
    if(form.dataset.form==='account') {
      const name=String(fd.get('name')||'').trim(),openingBalance=Number(fd.get('openingBalance'));
      if(!name||!Number.isFinite(openingBalance))return alert('Enter an account name and valid opening balance.');
      if(data().accounts.some(x=>x.name.toLowerCase()===name.toLowerCase()&&x.id!==id))return alert('An account with that name already exists.');
      const old=findById('accounts',id),item={id:id||makeId('acc'),name,type:String(fd.get('type')||'cash'),openingBalance:Math.round(openingBalance*100)/100,active:true,createdAt:old?.createdAt||new Date().toISOString(),updatedAt:Date.now()};upsert('accounts',item);commit();closeDialog();render();return;
    }
    if(form.dataset.form==='budget') {
      const categoryId=String(fd.get('categoryId')||''),month=String(fd.get('month')||''),limit=Number(fd.get('limit'));
      if(!getCategory(categoryId)||!(/^\d{4}-\d{2}$/.test(month))||!Number.isFinite(limit)||limit<=0)return alert('Enter a category, month, and valid budget limit.');
      if(data().budgets.some(x=>x.month===month&&x.categoryId===categoryId&&x.id!==id))return alert('A budget already exists for that category and month.');
      upsert('budgets',{id:id||makeId('budget'),categoryId,month,limit:finiteAmount(limit),updatedAt:Date.now()});commit();closeDialog();render();return;
    }
    if(form.dataset.form==='goal') {
      const name=String(fd.get('name')||'').trim(),target=Number(fd.get('target'));
      if(!name||!Number.isFinite(target)||target<=0)return alert('Enter a goal name and target amount.');
      const old=findById('goals',id);upsert('goals',{id:id||makeId('goal'),name,target:finiteAmount(target),openingSaved:old?.openingSaved||0,deadline:String(fd.get('deadline')||''),active:true,updatedAt:Date.now()});commit();closeDialog();render();return;
    }
    if(form.dataset.form==='obligation') {
      const type=String(fd.get('type')||'receivable'),contact=String(fd.get('contact')||'').trim(),amount=finiteAmount(fd.get('amount')),dueDate=String(fd.get('dueDate')||''),old=findById('obligations',id);
      if(!['receivable','payable'].includes(type)||!contact||amount<=0||!Number.isFinite(Number(fd.get('amount'))))return alert('Enter a name and a valid amount greater than zero.');
      if(dueDate&&!validDate(dueDate))return alert('Enter a valid due date.');
      if(old&&amount<old.paidAmount)return alert(`The amount cannot be less than the ${money(old.paidAmount)} already paid or collected.`);
      upsert('obligations',{id:id||makeId('owed'),type,contact,amount,paidAmount:old?.paidAmount||0,date:old?.date||dateFromToday(),dueDate,note:String(fd.get('note')||'').trim().slice(0,240),updatedAt:Date.now()});commit();closeDialog();render();return;
    }
    if(form.dataset.form==='settlement') {
      const obligation=findById('obligations',id),amount=Number(fd.get('amount')),accountId=String(fd.get('accountId')||'');
      if(!obligation||!Number.isFinite(amount)||amount<=0||amount>outstanding(obligation)||!getAccount(accountId)?.active)return alert('Enter a valid payment amount and choose an active account.');
      const incoming=obligation.type==='receivable',category=getCategory(incoming?'cat-income-other-income':'cat-expense-other-expense');
      if(!category)return alert('The matching income or expense category is missing.');
      upsert('transactions',{id:makeId('txn'),type:incoming?'income':'expense',amount:finiteAmount(amount),categoryId:category.id,categoryName:category.name,accountId,fromAccountId:'',toAccountId:'',goalId:'',note:`${incoming?'Collection from':'Payment to'} ${obligation.contact}${obligation.note?` · ${obligation.note}`:''}`.slice(0,240),date:dateFromToday(),time:timeFromNow(),reminderDate:'',reminderTime:'',recurringId:'',createdAt:new Date().toISOString(),updatedAt:Date.now()});
      obligation.paidAmount=finiteAmount(obligation.paidAmount+amount);obligation.updatedAt=Date.now();commitWithPrune();closeDialog();render();return;
    }
  }
  function notificationScheduleData() {
    const now=Date.now(),out=[];
    for(const tx of data().transactions) {
      if(!tx.reminderDate||!tx.reminderTime)continue;
      const time=api.dhakaDate?api.dhakaDate(tx.reminderDate,tx.reminderTime).getTime():new Date(`${tx.reminderDate}T${tx.reminderTime}:00`).getTime();
      if(time>now)out.push({id:`finance-${tx.id}`,time,name:`Finance reminder: ${tx.categoryName||TYPE_NAMES[tx.type]}`,start:tx.reminderTime,date:tx.reminderDate,kind:'finance',amount:tx.amount,currency:data().currency});
    }
    for(const rule of data().recurring.filter(x=>x.active&&x.reminderEnabled)) {
      const time=api.dhakaDate?api.dhakaDate(rule.nextDate,rule.reminderTime).getTime():new Date(`${rule.nextDate}T${rule.reminderTime}:00`).getTime();
      if(time>now)out.push({id:`finance-recurring-${rule.id}-${rule.nextDate}`,time,name:`Recurring ${TYPE_NAMES[rule.type]}: ${rule.categoryName}`,start:rule.reminderTime,date:rule.nextDate,kind:'finance',amount:rule.amount,currency:data().currency});
    }
    return out.sort((a,b)=>a.time-b.time).slice(0,100);
  }
  function scheduleBrowserReminders() {
    for(const timer of reminderTimers.values())clearTimeout(timer); reminderTimers.clear();
    if(!('Notification' in window)||Notification.permission!=='granted'||window.AndroidBridge?.scheduleReminders)return;
    const now=Date.now();
    for(const item of notificationScheduleData()) {
      if(item.time<=now||item.time-now>14*24*60*60*1000)continue;
      const timer=setTimeout(()=>{
        reminderTimers.delete(item.id);
        const options={body:`${item.name} · ${money(item.amount)}`,tag:item.id};
        try{
          const result=api.showNotification?api.showNotification('Finance reminder',options):new Notification('Finance reminder',options);
          Promise.resolve(result).catch(error=>console.error('Finance reminder notification failed.',error));
        }catch(error){console.error('Finance reminder notification failed.',error)}
      },item.time-now);
      reminderTimers.set(item.id,timer);
    }
  }
  function printReport() {
    const host=document.getElementById('financePrint');
    if(!host)return;
    document.body.classList.add('fin-printing');
    window.addEventListener('afterprint',()=>document.body.classList.remove('fin-printing'),{once:true});
    window.print();
    setTimeout(()=>document.body.classList.remove('fin-printing'),2000);
  }
  function handleAction(button) {
    const action=button.dataset.action,id=button.dataset.id;
    if(action==='section')setSection(button.dataset.section);
    if(action==='new-transaction')entryForm(button.dataset.type||'expense',null,button.dataset.goal||'');
    if(action==='edit-transaction')editTransaction(id);
    if(action==='delete-transaction')deleteTransaction(id);
    if(action==='close-dialog')closeDialog();
    if(action==='entry-type') {
      const form=document.getElementById('finModalForm'),selected=button.dataset.type;
      if(!form)return;
      const fd=new FormData(form), txId=form.dataset.id, old=txId?findById('transactions',txId):null;
      const typeCategory=data().categories.find(x=>x.active&&x.type===selected);
      const draft={type:selected,id:txId||'',amount:fd.get('amount'),date:fd.get('date'),time:fd.get('time'),itemName:fd.get('itemName'),note:fd.get('note'),accountId:fd.get('accountId')||data().accounts[0]?.id,fromAccountId:fd.get('fromAccountId'),toAccountId:fd.get('toAccountId'),goalId:fd.get('goalId'),categoryId:selected===old?.type?old.categoryId:typeCategory?.id||''};
      if(old)entryForm(selected,{...old,type:selected,categoryId:draft.categoryId},old.goalId);
      else entryForm(selected,null,draft.goalId,draft);
    }
    if(action==='period'){ui.txPeriod=button.dataset.period;render()}
    if(action==='report-type'){ui.reportType=button.dataset.type;render()}
    if(action==='report-mode'){ui.reportMode=button.dataset.mode==='custom'?'custom':'month';render()}
    if(action==='month-step') {
      const d=new Date(`${ui.month||dateFromToday().slice(0,7)}-15T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+Number(button.dataset.step));ui.month=d.toISOString().slice(0,7);render();
    }
    if(action==='new-category')categoryForm(null,button.dataset.type||'expense');
    if(action==='edit-category')editCategory(id);
    if(action==='delete-category')deleteCategory(id);
    if(action==='new-account')accountForm();
    if(action==='edit-account')editAccount(id);
    if(action==='delete-account')deleteAccount(id);
    if(action==='new-obligation')obligationForm(null,button.dataset.type||'receivable');
    if(action==='edit-obligation'){const item=findById('obligations',id);if(item)obligationForm(item,item.type)}
    if(action==='settle-obligation'){const item=findById('obligations',id);if(item&&outstanding(item)>0)settleObligationForm(item)}
    if(action==='delete-obligation'){const item=findById('obligations',id);if(item&&confirm(`Delete the ${item.type} for ${item.contact}? Payment transactions already recorded will remain in your ledger.`)){data().obligations=data().obligations.filter(x=>x.id!==id);commit();render()}}
    if(action==='new-budget')budgetForm();
    if(action==='edit-budget')budgetForm(findById('budgets',id));
    if(action==='delete-budget'){if(confirm('Delete this budget?')){data().budgets=data().budgets.filter(x=>x.id!==id);commit();render()}}
    if(action==='new-goal')goalForm();
    if(action==='edit-goal')goalForm(findById('goals',id));
    if(action==='delete-goal'){if(confirm('Delete this savings goal? Contributions will remain in history.')){data().goals=data().goals.filter(x=>x.id!==id);commit();render()}}
    if(action==='toggle-recurring'){const rule=findById('recurring',id);if(rule){rule.active=!rule.active;rule.updatedAt=Date.now();commit();render()}}
    if(action==='delete-recurring'){if(confirm('Delete this recurring schedule? Existing transactions will remain.')){data().recurring=data().recurring.filter(x=>x.id!==id);commit();render()}}
    if(action==='print-report')printReport();
    if(action==='request-reminders'){if(api.requestNotifications)api.requestNotifications();else if('Notification'in window)Notification.requestPermission().then(scheduleBrowserReminders)}
  }
  function onClick(event) {
    const button=event.target.closest('[data-action]');
    if(!button||!document.getElementById('finance')?.contains(button))return;
    event.preventDefault();handleAction(button);
  }
  function onChange(event) {
    const el=event.target;
    if(!document.getElementById('finance')?.contains(el))return;
    if(el.matches('[data-bind="currency"]')){data().currency=el.value;commit();render();return}
    if(el.matches('[data-bind="month"]')){ui.month=el.value;render();return}
    if(el.matches('[data-filter="from"]')){ui.txFrom=el.value;ui.txPeriod='custom';render();return}
    if(el.matches('[data-filter="to"]')){ui.txTo=el.value;ui.txPeriod='custom';render();return}
    if(el.matches('[data-filter="type"]'))ui.txType=el.value;
    if(el.matches('[data-filter="category"]'))ui.txCategory=el.value;
    if(el.matches('[data-filter="account"]'))ui.txAccount=el.value;
    if(el.matches('[data-filter="sort"]'))ui.txSort=el.value;
    if(el.matches('[data-report="from"]')){ui.reportFrom=el.value;ui.reportMode='custom'}
    if(el.matches('[data-report="to"]')){ui.reportTo=el.value;ui.reportMode='custom'}
    if(el.matches('[data-filter],[data-report]'))render();
  }
  function onInput(event) {
    const form=event.target.closest('#finModalForm');
    if(!form)return;
    if(event.target.name==='recurring'||event.target.name==='reminderEnabled')syncEntryOptionVisibility();
  }
  function onSubmit(event) {
    if(event.target.id!=='finModalForm')return;
    event.preventDefault();saveForm(event.target);
  }
  function onKey(event) {
    if(event.key==='Escape'&&document.body.classList.contains('fin-dialog-open'))closeDialog();
  }
  function initialize() {
    document.addEventListener('click',onClick);
    document.addEventListener('change',onChange);
    document.addEventListener('input',onInput);
    document.addEventListener('submit',onSubmit);
    document.addEventListener('keydown',onKey);
    window.addEventListener('focus',()=>{processDue();scheduleBrowserReminders()});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){processDue();scheduleBrowserReminders()}});
    window.addEventListener('resize',updateDialogViewport,{passive:true});
    window.visualViewport?.addEventListener('resize',updateDialogViewport,{passive:true});
    window.visualViewport?.addEventListener('scroll',updateDialogViewport,{passive:true});
  }
  function commitNormalize() {
    const clean=normalize(data());
    api.setData(clean);
    return clean;
  }
  function commitWithPrune() { commitNormalize(); pruneTransactions(); commit(); }
  function commit() {
    if(api.save)api.save();
    if(api.syncNow)api.syncNow();
    scheduleBrowserReminders();
  }

  initialize();
  window.Finance = {
    configure(options) { api=options; if(api.getData)api.setData(normalize(api.getData())); },
    normalize, collectSyncEntities, applySyncEntity, importLegacy, hasMeaningfulData,
    render, processDue, commitWithPrune, pruneTransactions, notificationScheduleData,
    nativeReminderPayload: notificationScheduleData, scheduleBrowserReminders,
    formatMoney: money
  };
})();
