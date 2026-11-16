/** Per-render hooks. Styles are loaded once from styles.css after shared CSS. */
export function createLifecycle(context, { state }) {
  const { elapsed, ui } = context;
  const installDraftListeners = (...args) => state.installDraftListeners(...args);
  const restoreForms = (...args) => state.restoreForms(...args);
  return function () {
    installDraftListeners();
    restoreForms();
    const follow = document.querySelector('[name="createFollowup"]');
    if (follow) {
      const panel = document.getElementById('rep-review-followup');
      if (panel) {
        panel.hidden = !follow.checked;
        const input = panel.querySelector('input');
        if (input) input.required = follow.checked;
      }
    }
    clearInterval(ui.timer);
    const node = document.getElementById('rep-visit-time');
    if (node)
      ui.timer = setInterval(() => {
        const live = document.getElementById('rep-visit-time');
        if (live) live.textContent = elapsed(live.dataset.started);
        else clearInterval(ui.timer);
      }, 1000);
  };
}
