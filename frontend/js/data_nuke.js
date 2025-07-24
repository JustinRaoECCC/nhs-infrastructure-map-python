// frontend/js/data_nuke.js

// When the user clicks the red button 3× within 1s, wipe and restart.
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnDataNuke');
  let clicks = [];
  btn.addEventListener('click', () => {
    const now = Date.now();
    clicks.push(now);
    // keep last 3 timestamps
    if (clicks.length > 3) clicks.shift();
    // if 3 clicks within 400ms → trigger nuke
    if (clicks.length === 3 && (clicks[2] - clicks[0] <= 400)) {
      // 1) ask for final confirmation
      if (window.confirm('⚠️ This will delete all data and restart the app. Proceed?')) {
        // 2) tell Python to delete everything
        window.electronAPI.dataNuke();
        // 3) then close the UI
        window.close();
      }
      clicks = [];
    }
  });
});
