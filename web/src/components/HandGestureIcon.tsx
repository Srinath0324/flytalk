import type { Intent } from '../interaction/types';

const PALM =
  'M22 56 15 41 9 31Q7 27 10 25Q13 23 16 28L21 35V16Q21 11 25 11Q29 11 29 16V30 9Q29 5 33 5Q37 5 37 9V29 13Q37 9 41 9Q45 9 45 13V31 21Q45 17 49 17Q53 17 53 21V40Q53 49 46 56Z';
const INDEX =
  'M22 56 16 43 12 34Q10 30 13 28Q16 26 19 31L23 36V10Q23 5 27 5Q31 5 31 10V29Q34 24 38 29Q42 25 46 30Q51 28 52 34V42Q52 50 46 56Z';
const VICTORY =
  'M23 56 16 42 12 33Q10 29 13 27Q16 25 19 30L24 36 18 12Q17 7 21 6Q25 5 27 10L33 29 37 9Q38 4 42 5Q46 6 45 11L41 32Q44 28 48 32Q52 31 53 36V42Q53 49 46 56Z';
const MIDDLE =
  'M22 56 17 44 14 35Q12 31 15 29Q18 27 22 31Q25 25 30 29V9Q30 4 34 4Q38 4 38 9V29Q42 25 46 30Q50 28 53 34V42Q53 50 46 56Z';
const THUMB =
  'M18 54V31L27 22 29 9Q30 5 34 7Q39 10 37 19L35 26H48Q54 26 53 32L49 49Q48 54 42 54Z M10 32H18V54H10Z';
const PINCH =
  'M22 56 17 44 13 32Q11 28 15 26Q18 25 21 29L27 37 34 29Q39 23 34 19Q30 15 26 20L21 26Q18 29 15 26Q12 24 15 20L22 12Q29 5 37 12L43 21Q47 18 49 23L52 32V43Q52 50 46 56Z';

/** Original pose illustrations: the same shapes appear in the dock and guide. */
export function HandGestureIcon({
  intent,
  title,
}: {
  intent: Intent;
  title: string;
}) {
  const point =
    intent === 'POINT_LEFT' || intent === 'POINT_RIGHT' || intent === 'COME';
  const path = point
    ? INDEX
    : intent === 'VICTORY'
      ? VICTORY
      : intent === 'MIDDLE_FINGER'
        ? MIDDLE
        : intent === 'THUMBS_UP'
          ? THUMB
          : intent === 'OFFER_NECTAR'
            ? PINCH
            : PALM;
  const turn =
    intent === 'POINT_LEFT' ? -90 : intent === 'POINT_RIGHT' ? 90 : 0;
  return (
    <svg
      className="hand-gesture-icon"
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <g
        transform={`rotate(${turn} 32 32)`}
        fill="currentColor"
        fillOpacity=".09"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={path} />
        <path d="M26 48Q33 44 41 47" fill="none" opacity=".55" />
      </g>
      {intent === 'WAVE' && (
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M10 7Q4 12 5 19M54 7Q60 12 59 19M6 7H10V11M58 19H62" />
        </g>
      )}
      {intent === 'GO_AWAY' && (
        <g
          fill="none"
          stroke="#52ff9d"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 49V38M3 43 7 38 11 43M58 49V38M54 43 58 38 62 43" />
        </g>
      )}
      {intent === 'OFFER_NECTAR' && (
        <circle
          cx="20"
          cy="26"
          r="4"
          fill="#52ff9d"
          fillOpacity=".35"
          stroke="currentColor"
        />
      )}
    </svg>
  );
}
