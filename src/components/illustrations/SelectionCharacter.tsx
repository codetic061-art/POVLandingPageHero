import { POV_PALETTE as P } from "./palette";

/** A shared, front-facing silhouette keeps the two selection figures in proportion. */
export function SelectionCharacter({ variant }: { variant: "male" | "female" }) {
  const female = variant === "female";

  return (
    <svg viewBox="38 10 224 370" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M55 105C78 71 152 75 207 109S274 181 232 206C280 256 249 322 205 326H82C29 304 25 254 64 227C12 196 24 141 55 105Z"
        fill={P.blue}
        opacity=".045"
      />
      <ellipse cx="150" cy="362" rx="103" ry="5" fill={P.charcoal} opacity=".07" />
      <g stroke={P.charcoal} strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round">
        {female && (
          <path
            d="M91 131C72 62 105 36 150 39C198 36 222 70 210 133C205 166 211 188 225 193C209 208 187 187 190 149H111C114 185 95 209 78 194C94 184 94 158 91 131Z"
            fill={P.ivory}
          />
        )}
        <circle cx="150" cy="100" r="54" fill={P.ivory} />
        <path d="M125 77Q131 71 137 76M165 76Q171 71 178 77" strokeWidth="2.8" />
        <ellipse cx="132" cy="92" rx="3.4" ry="6" fill={P.charcoal} stroke="none" />
        <ellipse cx="169" cy="92" rx="3.4" ry="6" fill={P.charcoal} stroke="none" />
        <path d="M121 111C129 137 170 139 181 111" strokeWidth="3.2" />
        {female ? (
          <>
            <path d="M127 85L124 82M132 84L131 80M174 85L177 81M169 84L170 80" strokeWidth="2" />
            <path
              d="M163 47Q159 28 166 19Q180 21 190 37Q208 29 220 34Q222 50 210 64L190 49Z"
              fill="#EC81AA"
            />
            <circle cx="190" cy="44" r="7" fill="#EC81AA" />
            <path d="M150 155L111 275Q150 289 190 275Z" fill={P.ivory} />
            <path d="M150 155L104 198L119 226M151 155L191 210L199 244" />
            <circle cx="119" cy="229" r="6" fill={P.ivory} />
            <circle cx="200" cy="249" r="7" fill={P.ivory} />
            <path d="M193 261Q191 247 203 248Q217 248 216 260" />
            <path d="M187 262L220 257L228 287L194 294Z" fill={P.ivory} />
            <path d="M137 282L135 355M165 282L174 355" />
            <path d="M135 355Q113 347 108 360H135ZM174 355Q194 348 201 360H174Z" fill={P.ivory} />
          </>
        ) : (
          <>
            <path d="M126 50L120 36M145 46Q141 28 149 23M162 47Q169 30 180 29" />
            <path d="M150 155L150 260M147 157Q96 172 96 228M154 158L192 190L172 217" />
            <path d="M148 261Q132 304 125 354M153 261Q174 307 181 354" />
            <path
              d="M125 354Q100 349 100 360H126ZM181 354Q204 349 208 360H181Z"
              fill={P.charcoal}
            />
            <path d="M146 156L154 156L158 165L151 174L144 164Z" fill={P.blue} strokeWidth="2.8" />
            <path d="M150 170L141 234L155 248L166 232L154 170Z" fill={P.blue} strokeWidth="2.8" />
            <circle cx="96" cy="231" r="7" fill={P.ivory} />
            <circle cx="173" cy="221" r="6" fill={P.ivory} />
            <path d="M85 248V241Q93 235 102 242V249" />
            <path d="M73 248L114 253L109 295L68 288Z" fill={P.ivory} />
            <path d="M73 267L112 272M81 266L80 273M103 269L102 276" strokeWidth="2.8" />
          </>
        )}
      </g>
      <path
        d={female ? "M69 69L60 54M59 87L43 82" : "M221 68L231 51M231 89L248 82"}
        stroke={female ? "#EC81AA" : P.blue}
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}
