/** Fills the calendar with the next six months, counted from today, so it never goes stale. */
export function fillMonths() {
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long' });
  document.querySelectorAll<HTMLElement>('[data-months] .cal-month').forEach((li, i) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() + i, 1);
    li.querySelector('.cal-name')!.textContent = monthName.format(d);
    li.querySelector('.cal-year')!.textContent = String(d.getFullYear());
  });
}
