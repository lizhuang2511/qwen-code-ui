export function UserAvatar() {
  return (
    <svg
      width="25"
      height="25"
      viewBox="0 0 25 25"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#clip0_722_882)">
        <circle cx="12.5" cy="12.5" r="12" stroke="#1C69FF" />
        <mask
          id="mask0_722_882"
          style={{ maskType: "alpha" }}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="25"
          height="25"
        >
          <circle cx="12.5" cy="12.5" r="12.5" fill="#D9D9D9" />
        </mask>
        <g mask="url(#mask0_722_882)">
          <circle cx="12.5" cy="30.6982" r="12.5" fill="#1C69FF" />
          <circle cx="12.5" cy="11.1329" r="5.13285" fill="#1C69FF" />
        </g>
      </g>
      <defs>
        <clipPath id="clip0_722_882">
          <rect width="25" height="25" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
