/* Auth — lightweight client-side gate for non-sensitive training content.
   NOTE: This is a soft gate (deters casual access), not real security.
   To change the access code, edit ACCESS_CODE below. Case-insensitive. */

var SWM_Auth = (function () {
  var ACCESS_CODE = 'OKFAMILIES2026'; // <-- change this to rotate access
  var KEY = 'swm_partner';

  function checkCode(code) {
    return String(code).trim().toLowerCase() === ACCESS_CODE.toLowerCase();
  }

  var STATE_CODES = {
    alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
    colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
    hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
    kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
    massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
    missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH',
    'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
    'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
    'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
    tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA',
    washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
    canada: 'Canada'
  };

  function titleCase(s) {
    return String(s).trim().toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function normalizeRegion(state) {
    var raw = String(state || '').trim();
    var key = raw.toLowerCase().replace(/\s+/g, ' ');
    var upper = raw.toUpperCase();
    var code = STATE_CODES[key] || (upper.length === 2 ? upper : raw);
    var label = code.length === 2
      ? Object.keys(STATE_CODES).find(function (name) { return STATE_CODES[name] === code; })
      : key;

    return {
      state: label ? titleCase(label) : titleCase(raw),
      stateCode: code,
      statePdf: label ? titleCase(label) + '.pdf' : titleCase(raw) + '.pdf'
    };
  }

  function login(name, state) {
    var region = normalizeRegion(state);
    var data = {
      name: String(name || '').trim(),
      state: region.state,
      stateCode: region.stateCode,
      statePdf: region.statePdf,
      since: new Date().toISOString()
    };
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  function current() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
  }

  function isLoggedIn() {
    var c = current();
    return !!(c && c.name);
  }

  function signout() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  return {
    checkCode: checkCode,
    login: login,
    current: current,
    isLoggedIn: isLoggedIn,
    signout: signout
  };
})();
