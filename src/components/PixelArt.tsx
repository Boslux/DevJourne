export function PixelAvatar({ kind = 'scout' }: { kind?: string }) {
  return (
    <svg
      className={`pixel-avatar pixel-${kind}`}
      viewBox="0 0 16 20"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <path fill="var(--avatar-dark)" d="M4 1h8v2h2v5H2V3h2z" />
      <path fill="var(--avatar-color)" d="M4 2h8v2h2v2H2V4h2z" />
      <path fill="#edc6a0" d="M4 6h8v6H4z" />
      <path fill="#263950" d="M5 7h2v2H5zm4 0h2v2H9z" />
      <path fill="var(--avatar-color)" d="M3 12h10v5H3z" />
      <path fill="#edc6a0" d="M1 12h2v4H1zm12 0h2v4h-2z" />
      <path fill="var(--avatar-dark)" d="M4 17h3v3H3v-2h1zm5 0h3v1h1v2H9z" />
      <path fill="#fff2c7" d="M7 12h2v2H7z" />
    </svg>
  );
}
export function WorldBackdrop() {
  return (
    <svg
      className="world-art"
      viewBox="0 0 1000 520"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <path
        fill="#dcecf1"
        d="M0 250h50v-35h50v-40h65v-35h70v35h60v40h55v35h95v-55h45v-35h70v-45h70v45h60v35h80v55h90v-40h85v-45h60v45h75v40h65v270H0z"
      />
      <path
        fill="#e1eddb"
        d="M0 350h90v-20h110v20h115v25h210v-25h120v-20h150v20h205v170H0z"
      />
      <path fill="#cce0c8" d="M0 430h160v20h160v25h325v-25h175v-20h180v90H0z" />
      <g fill="#9dbc98">
        <path d="M58 325h18v95H58zM896 345h18v110h-18z" />
      </g>
      <g fill="#afcea3">
        <path d="M20 290h20v-35h55v35h20v55H20zm840 35h25v-45h65v45h25v55H840z" />
      </g>
      <g fill="#c1d9b6">
        <path d="M35 260h55v30H35zm825 35h55v30h-55z" />
      </g>
      <g fill="#9ab789">
        <path d="M130 460h5v-15h5v15h10v5h-20zm660 30h5v-15h5v15h10v5h-20zM35 495h5v-15h5v15h10v5H35z" />
      </g>
      <g fill="#e9c47e">
        <path d="M165 440h8v8h-8zm700 35h8v8h-8z" />
      </g>
      <g fill="#fff" opacity=".75">
        <path d="M75 85h30V70h60v15h35v20H75zm665 40h25v-15h65v15h40v20H740z" />
      </g>
    </svg>
  );
}
