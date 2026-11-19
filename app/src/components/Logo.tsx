import { Link } from 'react-router';

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Do Something 首页">
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <path d="M7 25C9 11 16 7 29 9" />
        <path d="M7 10c7 1 14 7 22 16" />
        <circle cx="18" cy="18" r="3.2" />
      </svg>
      <span>Do Something</span>
    </Link>
  );
}
