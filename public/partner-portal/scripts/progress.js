/* Progress tracking — per-partner lesson completion in localStorage. */

var SWM_Progress = (function () {
  var KEY = 'swm_progress';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }

  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function isDone(id) {
    return !!load()[id];
  }

  function setDone(id, done) {
    var state = load();
    if (done) { state[id] = true; } else { delete state[id]; }
    save(state);
  }

  function completedCount() {
    return Object.keys(load()).length;
  }

  return {
    isDone: isDone,
    setDone: setDone,
    completedCount: completedCount
  };
})();
