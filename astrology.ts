import * as Astronomy from "astronomy-engine";

export type BirthLocation = {
  id: number;
  name: string;
  admin1?: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

export type ZodiacSign = {
  name: string;
  symbol: string;
};

export type CelestialPosition = {
  name: string;
  longitude: number;
  sign: ZodiacSign;
  degreesInSign: number;
  nakshatra: string;
  pada: number;
  house: number;
};

export type BirthChart = {
  date: Date;
  ayanamsa: number;
  ascendant: CelestialPosition;
  planets: CelestialPosition[];
};

export type DailyPanchang = {
  dateLabel: string;
  tithi: string;
  nakshatra: string;
  yoga: string;
  karana: string;
  sunrise: Date | null;
  sunset: Date | null;
  rahuKaalStart: Date | null;
  rahuKaalEnd: Date | null;
};

const SIGNS: ZodiacSign[] = [
  { name: "Aries", symbol: "♈" },
  { name: "Taurus", symbol: "♉" },
  { name: "Gemini", symbol: "♊" },
  { name: "Cancer", symbol: "♋" },
  { name: "Leo", symbol: "♌" },
  { name: "Virgo", symbol: "♍" },
  { name: "Libra", symbol: "♎" },
  { name: "Scorpio", symbol: "♏" },
  { name: "Sagittarius", symbol: "♐" },
  { name: "Capricorn", symbol: "♑" },
  { name: "Aquarius", symbol: "♒" },
  { name: "Pisces", symbol: "♓" },
];

const NAKSHATRAS = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu",
  "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta",
  "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha", "Mula",
  "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha",
  "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
];

const TITHIS = [
  "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi",
  "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dwadashi",
  "Trayodashi", "Chaturdashi", "Purnima",
];

const YOGAS = [
  "Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda",
  "Sukarma", "Dhriti", "Shula", "Ganda", "Vriddhi", "Dhruva", "Vyaghata",
  "Harshana", "Vajra", "Siddhi", "Vyatipata", "Variyana", "Parigha",
  "Shiva", "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti",
];

const REPEATING_KARANAS = [
  "Bava", "Balava", "Kaulava", "Taitila", "Garaja", "Vanija", "Vishti",
];

const RAHU_KAAL_SEGMENT_BY_WEEKDAY = [8, 2, 7, 5, 6, 4, 3];
const NAKSHATRA_ARC = 360 / 27;
const SIGN_ARC = 30;

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function datePartsInZone(date: Date, timezone: string): number[] {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
  } catch {
    throw new Error(`The time zone "${timezone}" is not supported on this device.`);
  }
  const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  return [values.year, values.month, values.day, values.hour, values.minute, values.second];
}

function timezoneOffsetMinutes(date: Date, timezone: string): number {
  const [year, month, day, hour, minute, second] = datePartsInZone(date, timezone);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return (localAsUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000;
}

export function parseBirthDateTime(dateInput: string, timeInput: string, timezone: string): Date {
  const dateMatch = dateInput.trim().match(/^(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})$/);
  const timeMatch = timeInput.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!dateMatch) throw new Error("Enter the birth date as DD/MM/YYYY.");
  if (!timeMatch) throw new Error("Enter the birth time as HH:MM using the 24-hour clock.");

  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) {
    throw new Error("Enter a valid calendar date for the birth date.");
  }
  if (year < 1800 || year > 2100) {
    throw new Error("Birth dates from 1800 through 2100 are supported.");
  }

  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = new Date(localAsUtc);
  const firstOffset = timezoneOffsetMinutes(firstGuess, timezone);
  const firstUtc = new Date(localAsUtc - firstOffset * 60000);
  const secondOffset = timezoneOffsetMinutes(firstUtc, timezone);
  const birthMoment = new Date(localAsUtc - secondOffset * 60000);
  const [localYear, localMonth, localDay, localHour, localMinute] = datePartsInZone(birthMoment, timezone);

  if (
    localYear !== year || localMonth !== month || localDay !== day ||
    localHour !== hour || localMinute !== minute
  ) {
    throw new Error("That local birth time does not exist in this location because of a daylight-saving clock change.");
  }
  return birthMoment;
}

function approximateLahiriAyanamsa(date: Date): number {
  const year = date.getUTCFullYear() + date.getUTCMonth() / 12 + date.getUTCDate() / 365.2425;
  return 23.857092 + (year - 2000) * (50.290966 / 3600);
}

function positionAt(name: string, longitude: number, ascendantSignIndex: number): CelestialPosition {
  const siderealLongitude = normalizeDegrees(longitude);
  const signIndex = Math.floor(siderealLongitude / SIGN_ARC);
  const nakshatraIndex = Math.floor(siderealLongitude / NAKSHATRA_ARC);
  const withinNakshatra = siderealLongitude - nakshatraIndex * NAKSHATRA_ARC;
  return {
    name,
    longitude: siderealLongitude,
    sign: SIGNS[signIndex],
    degreesInSign: siderealLongitude - signIndex * SIGN_ARC,
    nakshatra: NAKSHATRAS[nakshatraIndex],
    pada: Math.floor(withinNakshatra / (NAKSHATRA_ARC / 4)) + 1,
    house: ((signIndex - ascendantSignIndex + 12) % 12) + 1,
  };
}

function ascendantLongitude(date: Date, latitude: number, longitude: number): number {
  const julianDate = date.getTime() / 86400000 + 2440587.5;
  const centuries = (julianDate - 2451545) / 36525;
  const greenwichSiderealDegrees = normalizeDegrees(
    280.46061837 +
      360.98564736629 * (julianDate - 2451545) +
      0.000387933 * centuries ** 2 -
      centuries ** 3 / 38710000,
  );
  const localSiderealRadians = normalizeDegrees(greenwichSiderealDegrees + longitude) * Math.PI / 180;
  const obliquityRadians = (23.439291 - 0.0130042 * centuries) * Math.PI / 180;
  const latitudeRadians = latitude * Math.PI / 180;
  const tropicalLongitude = normalizeDegrees(
    Math.atan2(
      -Math.cos(localSiderealRadians),
      Math.sin(obliquityRadians) * Math.tan(latitudeRadians) +
        Math.cos(obliquityRadians) * Math.sin(localSiderealRadians),
    ) * 180 / Math.PI,
  );
  return normalizeDegrees(tropicalLongitude - approximateLahiriAyanamsa(date));
}

function tropicalLongitude(body: Astronomy.Body, date: Date): number {
  if (body === Astronomy.Body.Sun) return Astronomy.SunPosition(date).elon;
  if (body === Astronomy.Body.Moon) return Astronomy.EclipticGeoMoon(date).lon;
  return normalizeDegrees(Astronomy.SunPosition(date).elon + Astronomy.PairLongitude(body, Astronomy.Body.Sun, date));
}

export function calculateBirthChart(date: Date, location: BirthLocation): BirthChart {
  if (!Number.isFinite(location.latitude) || Math.abs(location.latitude) > 66) {
    throw new Error("The ascendant calculation is unavailable for locations above 66° latitude.");
  }
  const ayanamsa = approximateLahiriAyanamsa(date);
  const ascendantLongitudeValue = ascendantLongitude(date, location.latitude, location.longitude);
  const ascendantSignIndex = Math.floor(ascendantLongitudeValue / SIGN_ARC);
  const bodies: Array<[string, Astronomy.Body]> = [
    ["Sun", Astronomy.Body.Sun],
    ["Moon", Astronomy.Body.Moon],
    ["Mercury", Astronomy.Body.Mercury],
    ["Venus", Astronomy.Body.Venus],
    ["Mars", Astronomy.Body.Mars],
    ["Jupiter", Astronomy.Body.Jupiter],
    ["Saturn", Astronomy.Body.Saturn],
  ];
  const planets = bodies.map(([name, body]) =>
    positionAt(name, tropicalLongitude(body, date) - ayanamsa, ascendantSignIndex),
  );

  const centuries = (date.getTime() / 86400000 + 2440587.5 - 2451545) / 36525;
  const meanNode = normalizeDegrees(
    125.04452 - 1934.136261 * centuries + 0.0020708 * centuries ** 2 + centuries ** 3 / 450000,
  );
  planets.push(positionAt("Rahu (mean)", meanNode - ayanamsa, ascendantSignIndex));
  planets.push(positionAt("Ketu (mean)", meanNode + 180 - ayanamsa, ascendantSignIndex));

  return {
    date,
    ayanamsa,
    ascendant: positionAt("Ascendant", ascendantLongitudeValue, ascendantSignIndex),
    planets,
  };
}

function localDateString(date: Date, timezone: string): string {
  const [year, month, day] = datePartsInZone(date, timezone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatLocalTime(date: Date | null, timezone: string, locale: string): string {
  if (!date) return "Unavailable";
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatZonedDate(date: Date, timezone: string, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

export function formatPlanetPosition(position: CelestialPosition): string {
  const degree = Math.floor(position.degreesInSign);
  const minutes = Math.floor((position.degreesInSign - degree) * 60);
  return `${position.sign.symbol} ${position.sign.name} ${degree}° ${String(minutes).padStart(2, "0")}′`;
}

function tithiName(elongation: number): string {
  const index = Math.floor(normalizeDegrees(elongation) / 12);
  if (index === 14) return "Purnima";
  if (index === 29) return "Amavasya";
  const paksha = index < 15 ? "Shukla" : "Krishna";
  return `${paksha} ${TITHIS[index % 15]}`;
}

function karanaName(elongation: number): string {
  const index = Math.floor(normalizeDegrees(elongation) / 6);
  if (index === 0) return "Kimstughna";
  if (index >= 57) return ["Shakuni", "Chatushpada", "Naga"][index - 57];
  return REPEATING_KARANAS[(index - 1) % REPEATING_KARANAS.length];
}

function localMidnight(date: string, timezone: string): Date {
  return parseBirthDateTime(
    `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`,
    "00:00",
    timezone,
  );
}

export function calculateDailyPanchang(date: Date, location: BirthLocation): DailyPanchang {
  const dateLabel = formatZonedDate(date, location.timezone);
  const sunLongitude = normalizeDegrees(Astronomy.SunPosition(date).elon - approximateLahiriAyanamsa(date));
  const moonLongitude = normalizeDegrees(Astronomy.EclipticGeoMoon(date).lon - approximateLahiriAyanamsa(date));
  const elongation = normalizeDegrees(moonLongitude - sunLongitude);
  const yogaIndex = Math.floor(normalizeDegrees(moonLongitude + sunLongitude) / NAKSHATRA_ARC);
  const moonNakshatra = NAKSHATRAS[Math.floor(moonLongitude / NAKSHATRA_ARC)];
  const observer = new Astronomy.Observer(location.latitude, location.longitude, 0);
  const midnight = localMidnight(localDateString(date, location.timezone), location.timezone);
  const sunrise = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, +1, midnight, 1)?.date ?? null;
  const sunset = sunrise
    ? Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, sunrise, 1)?.date ?? null
    : null;
  let rahuKaalStart: Date | null = null;
  let rahuKaalEnd: Date | null = null;

  if (sunrise && sunset) {
    const weekday = new Date(`${localDateString(date, location.timezone)}T00:00:00Z`).getUTCDay();
    const segmentDuration = (sunset.getTime() - sunrise.getTime()) / 8;
    const segmentStart = RAHU_KAAL_SEGMENT_BY_WEEKDAY[weekday] - 1;
    rahuKaalStart = new Date(sunrise.getTime() + segmentStart * segmentDuration);
    rahuKaalEnd = new Date(rahuKaalStart.getTime() + segmentDuration);
  }

  return {
    dateLabel,
    tithi: tithiName(elongation),
    nakshatra: moonNakshatra,
    yoga: YOGAS[yogaIndex],
    karana: karanaName(elongation),
    sunrise,
    sunset,
    rahuKaalStart,
    rahuKaalEnd,
  };
}

export function formatPanchangTime(date: Date | null, timezone: string, locale = "en"): string {
  return formatLocalTime(date, timezone, locale);
}
