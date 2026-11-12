;(() => {
  try {
    const t = localStorage.getItem('kit.theme') || 'system'
    const dark =
      t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
  } catch {
    /* ignore */
  }
})()
