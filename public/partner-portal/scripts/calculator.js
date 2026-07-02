/* Live earnings calculator. Renders into a container and wires up sliders.
   Commission model (from the business plan):
     - 25% recurring on active monthly sponsor revenue
     - jumps to 30% at 15+ active sponsors
     - +10% fast-start bonus on each sponsor's first payment */

var SWM_Calc = (function () {
  var AVG_SPONSOR_MO = 220;        // blended avg monthly sponsorship ($ Exclusive + Supporter)
  var BASE_RATE = 0.25;
  var BONUS_RATE = 0.30;           // 15+ active sponsors
  var BONUS_THRESHOLD = 15;
  var FAST_START = 0.10;

  function money(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function compute(sponsors, avg) {
    var rate = sponsors >= BONUS_THRESHOLD ? BONUS_RATE : BASE_RATE;
    var monthly = sponsors * avg * rate;
    var firstBonus = sponsors * avg * FAST_START;
    var firstMonth = monthly + firstBonus;
    var annual = monthly * 12;
    return { rate: rate, monthly: monthly, firstBonus: firstBonus, firstMonth: firstMonth, annual: annual };
  }

  function mount(el) {
    if (!el) return;
    el.innerHTML =
      '<div class="calc">' +
        '<div>' +
          '<label class="field range">' +
            '<span>Active sponsors <output id="calc-spon">10</output></span>' +
            '<input type="range" id="r-spon" min="1" max="41" value="10" />' +
          '</label>' +
          '<label class="field range">' +
            '<span>Avg sponsorship / month <output id="calc-avg">$' + AVG_SPONSOR_MO + '</output></span>' +
            '<input type="range" id="r-avg" min="99" max="399" step="1" value="' + AVG_SPONSOR_MO + '" />' +
          '</label>' +
          '<p class="calc__note" id="calc-rate"></p>' +
          '<div class="commission-grid">' +
            '<span><b>Collected revenue only</b> Paid after Stand With Meg is paid.</span>' +
            '<span><b>15+ active sponsors</b> Unlocks the 30% personal rate.</span>' +
            '<span><b>Payment stops if sponsor stops</b> Monthly residuals only continue while that sponsor pays.</span>' +
            '<span><b>30-day clawback</b> Refunds or chargebacks reverse commission.</span>' +
          '</div>' +
        '</div>' +
        '<div class="calc__out">' +
          '<div class="calc__big" id="calc-month"></div>' +
          '<p class="calc__note">recurring, every month</p>' +
          '<div style="margin-top:1rem; font-size:1.15rem; color:var(--color-white);" id="calc-first"></div>' +
          '<p class="calc__note">estimated first-month total with fast-start bonus</p>' +
          '<div style="margin-top:1rem; font-size:1.4rem; color:var(--color-white);" id="calc-year"></div>' +
          '<p class="calc__note">per year, if they stay</p>' +
        '</div>' +
      '</div>';

    var rSpon = el.querySelector('#r-spon');
    var rAvg = el.querySelector('#r-avg');

    function render() {
      var s = parseInt(rSpon.value, 10);
      var a = parseInt(rAvg.value, 10);
      var out = compute(s, a);
      el.querySelector('#calc-spon').textContent = s;
      el.querySelector('#calc-avg').textContent = money(a);
      el.querySelector('#calc-month').innerHTML = money(out.monthly) + '<small>/mo</small>';
      el.querySelector('#calc-first').textContent = money(out.firstMonth) + ' first month';
      el.querySelector('#calc-year').textContent = money(out.annual) + ' / year';
      el.querySelector('#calc-rate').textContent =
        'Your rate: ' + (out.rate * 100) + '%' +
        (s >= BONUS_THRESHOLD ? ' — 30% accelerator unlocked' : ' (hits 30% at 15+ sponsors)') +
        ' · fast-start bonus: ' + money(out.firstBonus);
    }

    rSpon.addEventListener('input', render);
    rAvg.addEventListener('input', render);
    render();
  }

  return { mount: mount };
})();
