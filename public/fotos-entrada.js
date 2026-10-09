(() => {
  const envelope = document.querySelector('#photo-invitation');
  const page = document.querySelector('#photo-page');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const { gsap, SplitText } = window;
  const splits = [];
  let intro;
  let reveal;
  let finished = false;
  let fallback;

  function releasePage() {
    envelope.remove();
    page.inert = false;
    document.body.classList.remove('invitation-closed');
  }

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(fallback);
    intro?.kill();
    reveal?.kill();
    splits.forEach(split => split.revert());
    if (gsap) gsap.set('#title, .photo-composition, .photo-actions, [data-split]', { clearProps: 'all' });
    releasePage();
    motion.removeEventListener('change', onMotionChange);
  }

  function onMotionChange(event) {
    if (event.matches) finish();
  }

  if (!gsap || motion.matches) {
    finish();
    return;
  }

  envelope.hidden = false;
  page.inert = true;
  document.body.classList.add('invitation-closed');
  motion.addEventListener('change', onMotionChange);
  // Content always remains reachable if font loading or an animation fails.
  fallback = setTimeout(finish, 7000);

  function revealContent() {
    if (finished) return;
    try {
      reveal = gsap.timeline({ onComplete: finish });
      reveal.from('#title', { opacity: 0, duration: 1.15, ease: 'power2.out' }, 0);
      reveal.from('.photo-composition', { opacity: 0, y: 12, duration: 1.1, ease: 'power2.out' }, 0.12);
      reveal.from('.photo-actions', { opacity: 0, duration: .8 }, .4);
      if (SplitText) {
        gsap.registerPlugin(SplitText);
        document.querySelectorAll('[data-split]').forEach((element, index) => {
          const split = SplitText.create(element, { type: 'words', aria: 'auto' });
          splits.push(split);
          reveal.from(split.words, {
            opacity: 0, y: 7, duration: .65, stagger: .025, ease: 'power2.out'
          }, .18 + index * .12);
        });
      } else {
        reveal.from('[data-split]', { opacity: 0, duration: .7, stagger: .1 }, .2);
      }
    } catch {
      finish();
    }
  }

  // Match the existing home's opposing lace panels, now driven by GSAP.
  // Start at DOM ready; no click, image download or window.load is required.
  try {
    intro = gsap.timeline();
    intro.to('.invitation-seal', { opacity: 0, duration: .4 }, .15)
      .to(envelope, { backgroundColor: 'rgba(232,225,213,0)', duration: 1.6 }, .25)
      .to('.lace-top', { yPercent: -110, duration: 1.8, ease: 'power3.inOut' }, .25)
      .to('.lace-bottom', { yPercent: 110, duration: 1.8, ease: 'power3.inOut' }, .25)
      .call(releasePage, [], 2.05);
    Promise.race([
      document.fonts.ready,
      new Promise(resolve => setTimeout(resolve, 1800))
    ]).then(() => {
      if (!finished) intro.call(revealContent, [], Math.max(1.35, intro.time()));
    }).catch(finish);
  } catch {
    finish();
  }
})();
