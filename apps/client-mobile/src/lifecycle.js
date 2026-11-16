/** Per-render hooks. Styles are loaded once from styles.css after shared CSS. */
export function createLifecycle(context) {
  const {} = context;
  return ({ route }) => {
    if (route === 'messages') {
      const messages = document.getElementById('client-messages');
      if (messages) messages.scrollTop = messages.scrollHeight;
    }
  };
}
