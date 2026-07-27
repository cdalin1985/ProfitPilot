import "server-only";

import countries from "i18n-iso-countries";
import englishCountries from "i18n-iso-countries/langs/en.json";

countries.registerLocale(englishCountries);

export interface SelectOption {
  value: string;
  label: string;
}

export const supportedLanguages: readonly SelectOption[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "nl", label: "Dutch" },
  { value: "da", label: "Danish" },
  { value: "no", label: "Norwegian" },
  { value: "sv", label: "Swedish" },
] as const;

export function getOnboardingOptions(): {
  countries: SelectOption[];
  currencies: SelectOption[];
  timezones: SelectOption[];
} {
  const displayCurrency = new Intl.DisplayNames(["en"], {
    type: "currency",
  });

  return {
    countries: Object.entries(countries.getNames("en", { select: "official" }))
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    currencies: Intl.supportedValuesOf("currency")
      .map((value) => ({
        value,
        label: `${value} — ${displayCurrency.of(value) ?? value}`,
      }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    timezones: ["UTC", ...Intl.supportedValuesOf("timeZone")].map((value) => ({
      value,
      label: value.replaceAll("_", " "),
    })),
  };
}
