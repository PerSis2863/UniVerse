const fs = require('fs');
const path = require('path');
const p = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'payments.json'), 'utf8'));

p.transactions.forEach(t => {
  const inv = p.invoices.find(i => i.id === t.invoiceId);
  if (inv) {
    t.amount = inv.amount;
  }
});

fs.writeFileSync(path.join(__dirname, 'data', 'payments.json'), JSON.stringify(p, null, 2));
console.log('Patched payments.json');
