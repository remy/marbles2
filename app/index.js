const themes = document.querySelector('#themes > div');

themes.addEventListener('change', (e) => {
  if (e.target.nodeName !== 'INPUT') {
    return;
  }

  const theme = parseInt(e.target.value, 10);
  localStorage.setItem('theme', theme);
});

const theme = +localStorage.getItem('theme') || 0;
themes.children[theme].checked = true;

async function highScores() {
  const data = new DataView(
    await fetch('/scores').then((res) => res.arrayBuffer())
  );

  const scores = [];

  for (let i = 0; i < data.byteLength; i += 8) {
    const name = new TextDecoder().decode(data.buffer.slice(i, i + 3));
    const level = data.getUint8(i + 3);
    const seed = data.getUint16(i + 4, true).toString(16);
    const score = data.getUint16(i + 6, true);
    scores.push({ name, level, seed, score });
    if (scores.length === 10) break;
  }

  const html = scoreHTML(scores);
  document.querySelector('#highscores').innerHTML = html;
}

function scoreHTML(scores) {
  return scores
    .map(
      ({ name, seed, score }, i) =>
        `<tr><td class="name"><span>${(i + 1)
          .toString()
          .padStart(
            2,
            ' '
          )}.</span>${name}</td><td class="seed">#${seed}</td><td class="score">${score}</td></tr>`
    )
    .join('\n');
}

highScores();
