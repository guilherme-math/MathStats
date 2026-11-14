(function () {
  'use strict';

  window.addEventListener('pagehide', function (event) {
    if (event.persisted) document.documentElement.style.visibility = 'hidden';
  });
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) window.location.reload();
  });

  var logout = document.getElementById('logoutBtn');
  if (!logout) return;

  logout.addEventListener('click', async function () {
    logout.disabled = true;
    try {
      var response = await fetch('/api/logout', { method: 'POST' });
      if (!response.ok && response.status !== 401) throw new Error();
      window.location.replace('/login');
    } catch (error) {
      logout.disabled = false;
      window.alert('Não foi possível sair da conta. Tente novamente.');
    }
  });
})();
