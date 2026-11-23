import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants, { ExecutionEnvironment } from "expo-constants";
import Purchases, { CustomerInfo, LOG_LEVEL, PACKAGE_TYPE, PurchasesPackage } from "react-native-purchases";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  I18nManager,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  BirthChart,
  BirthLocation,
  calculateBirthChart,
  calculateDailyPanchang,
  formatPanchangTime,
  formatPlanetPosition,
  formatZonedDate,
  parseBirthDateTime,
} from "./astrology";
import { formatLocationName, searchBirthLocations } from "./location-service";
import { getLanguage, languages, LanguageCode, translate, TranslationKey } from "./localization";

type Tab = "Home" | "Kundli" | "Panchang" | "Ask";

type Profile = {
  name: string;
  date: string;
  time: string;
  place: string;
};

const PREMIUM_ENTITLEMENT = "plus";
const MONTHLY_PRODUCT_ID = "astrojyotish_plus_monthly";
const configuredRevenueCatKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? "";
const REVENUECAT_ANDROID_API_KEY =
  __DEV__ || configuredRevenueCatKey.startsWith("goog_") ? configuredRevenueCatKey : "";
const LANGUAGE_STORAGE_KEY = "astrojyotish.language";

const initialProfile: Profile = {
  name: "",
  date: "",
  time: "",
  place: "",
};

function normalizeDigits(value: string): string {
  const digitBlocks = [0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0660, 0x06f0];
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    const block = digitBlocks.find((start) => codePoint >= start && codePoint <= start + 9);
    return block === undefined ? character : String(codePoint - block);
  }).join("");
}

const palette = {
  ink: "#25223A",
  muted: "#777487",
  purple: "#6550B5",
  purpleLight: "#F0EDFA",
  gold: "#D4953E",
  cream: "#FFF9F0",
  white: "#FFFFFF",
  line: "#EEEAF2",
  green: "#4B8A69",
};

export default function App() {
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [savedProfile, setSavedProfile] = useState<Profile>(initialProfile);
  const [birthLocation, setBirthLocation] = useState<BirthLocation | null>(null);
  const [birthChart, setBirthChart] = useState<BirthChart | null>(null);
  const [locationCandidates, setLocationCandidates] = useState<BirthLocation[]>([]);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("Home");
  const [hasProfile, setHasProfile] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [languageLoaded, setLanguageLoaded] = useState(false);
  const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(null);
  const [hasPremium, setHasPremium] = useState(false);
  const [purchasePending, setPurchasePending] = useState(false);
  const [billingMessage, setBillingMessage] = useState("");
  const [question, setQuestion] = useState("");
  const [askedQuestions, setAskedQuestions] = useState(0);
  const [answer, setAnswer] = useState("");

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
      .then((savedLanguage) => {
        if (active && savedLanguage) setLanguage(getLanguage(savedLanguage).code);
      })
      .catch(() => {
        Alert.alert("Language setting", "The saved language could not be loaded. English will be used for this session.");
      })
      .finally(() => {
        if (active) setLanguageLoaded(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!languageLoaded) return;
    AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language).catch(() => {
      Alert.alert("Language setting", "Your language choice could not be saved on this device.");
    });
    const usesRTL = language === "ks" || language === "sd" || language === "ur";
    if (I18nManager.isRTL !== usesRTL) {
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(usesRTL);
    }
  }, [language, languageLoaded]);

  const t = (key: TranslationKey) => translate(language, key);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return;
    if (!REVENUECAT_ANDROID_API_KEY) return;

    let active = true;
    let listenerRegistered = false;
    const updateEntitlement = (customerInfo: CustomerInfo) => {
      if (active) setHasPremium(Boolean(customerInfo.entitlements.active[PREMIUM_ENTITLEMENT]));
    };

    const loadBilling = async () => {
      try {
        if (!(await Purchases.isConfigured())) {
          Purchases.setLogLevel(LOG_LEVEL.ERROR);
          Purchases.configure({ apiKey: REVENUECAT_ANDROID_API_KEY });
        }
        Purchases.addCustomerInfoUpdateListener(updateEntitlement);
        listenerRegistered = true;

        const [customerInfo, offerings] = await Promise.all([
          Purchases.getCustomerInfo(),
          Purchases.getOfferings(),
        ]);
        if (!active) return;
        updateEntitlement(customerInfo);
        const packages = offerings.current?.availablePackages ?? [];
        const selectedMonthlyPackage =
          packages.find((purchasePackage) => purchasePackage.product.identifier === MONTHLY_PRODUCT_ID) ??
          packages.find((purchasePackage) => purchasePackage.packageType === PACKAGE_TYPE.MONTHLY) ??
          null;
        setMonthlyPackage(selectedMonthlyPackage);
        if (!selectedMonthlyPackage) {
          setBillingMessage("The current RevenueCat offering does not contain a monthly subscription package.");
        }
      } catch (error) {
        if (active) {
          setBillingMessage(error instanceof Error ? error.message : "Subscription billing could not be initialized.");
        }
      }
    };

    void loadBilling();
    return () => {
      active = false;
      if (listenerRegistered) Purchases.removeCustomerInfoUpdateListener(updateEntitlement);
    };
  }, []);

  const updateProfile = (key: keyof Profile, value: string) => {
    setProfile((current) => ({ ...current, [key]: value }));
    setProfileError("");
    setLocationCandidates([]);
  };

  const purchasePremium = async () => {
    if (Platform.OS !== "android") {
      setBillingMessage("Subscriptions are available in the Android app.");
      return;
    }
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      setBillingMessage("Expo Go does not include native purchase support. Install the Android development build to test subscriptions.");
      return;
    }
    if (!REVENUECAT_ANDROID_API_KEY) {
      setBillingMessage("Add your RevenueCat Android public SDK key to EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY and rebuild the app.");
      return;
    }
    if (!monthlyPackage) {
      setBillingMessage("The monthly Play product or RevenueCat offering is not configured yet.");
      return;
    }

    setPurchasePending(true);
    setBillingMessage("");
    try {
      const { customerInfo } = await Purchases.purchasePackage(monthlyPackage);
      setHasPremium(Boolean(customerInfo.entitlements.active[PREMIUM_ENTITLEMENT]));
    } catch (error) {
      setBillingMessage(error instanceof Error ? error.message : "The subscription purchase could not be completed.");
    } finally {
      setPurchasePending(false);
    }
  };

  const restorePurchases = async () => {
    if (Platform.OS !== "android" || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      setBillingMessage("Restore purchases from the Android development build.");
      return;
    }
    if (!REVENUECAT_ANDROID_API_KEY) {
      setBillingMessage("Add your RevenueCat Android public SDK key before restoring purchases.");
      return;
    }

    setPurchasePending(true);
    setBillingMessage("");
    try {
      const customerInfo = await Purchases.restorePurchases();
      const activeEntitlement = Boolean(customerInfo.entitlements.active[PREMIUM_ENTITLEMENT]);
      setHasPremium(activeEntitlement);
      if (!activeEntitlement) setBillingMessage("No active AstroJyotish Plus subscription was found for this account.");
    } catch (error) {
      setBillingMessage(error instanceof Error ? error.message : "Purchases could not be restored.");
    } finally {
      setPurchasePending(false);
    }
  };

  const openProfileForm = () => {
    setProfile(savedProfile);
    setProfileError("");
    setLocationCandidates([]);
    setShowSettings(false);
    setShowPremium(false);
    setShowProfileForm(true);
  };

  const saveProfileAtLocation = (location: BirthLocation) => {
    try {
      const birthMoment = parseBirthDateTime(
        normalizeDigits(profile.date),
        normalizeDigits(profile.time),
        location.timezone,
      );
      const chart = calculateBirthChart(birthMoment, location);
      setSavedProfile(profile);
      setBirthLocation(location);
      setBirthChart(chart);
      setHasProfile(true);
      setShowProfileForm(false);
      setShowSettings(false);
      setLocationCandidates([]);
      setProfileError("");
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Could not calculate the birth chart.");
    }
  };

  const saveProfile = async () => {
    if (!profile.name.trim() || !profile.date.trim() || !profile.time.trim() || !profile.place.trim()) {
      Alert.alert("A few details are missing", "Please complete each field to save your birth profile.");
      return;
    }
    try {
      parseBirthDateTime(normalizeDigits(profile.date), normalizeDigits(profile.time), "UTC");
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Enter a valid birth date and time.");
      return;
    }

    setIsResolvingLocation(true);
    setProfileError("");
    try {
      const locations = await searchBirthLocations(profile.place);
      if (locations.length === 0) {
        setProfileError("No matching place was found. Enter a city and country, then try again.");
      } else if (locations.length === 1) {
        saveProfileAtLocation(locations[0]);
      } else {
        setLocationCandidates(locations);
      }
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Could not look up the birth place.");
    } finally {
      setIsResolvingLocation(false);
    }
  };

  const sendQuestion = () => {
    if (!question.trim()) return;
    if (!hasPremium && askedQuestions >= 3) {
      setShowPremium(true);
      return;
    }
    setAskedQuestions((count) => count + 1);
    const moon = birthChart?.planets.find((planet) => planet.name === "Moon");
    const chartContext = moon
      ? ` Your calculated chart places the Moon in ${moon.nakshatra} (${moon.sign.name}), house ${moon.house}.`
      : "";
    setAnswer(
      `${chartContext} This is a sample response, not an AI-generated reading. Reflect on the practical options and what matters most to you.`,
    );
    setQuestion("");
  };

  const openTab = (tab: Tab) => {
    setShowSettings(false);
    setShowPremium(false);
    setShowProfileForm(false);
    setShowLanguagePicker(false);
    setActiveTab(tab);
  };

  const renderHeader = () => (
    <View style={styles.topBar}>
      <View>
        <Text style={styles.brand}>✦ AstroJyotish</Text>
        <Text style={styles.brandCaption}>{t("brandCaption")}</Text>
      </View>
      <TouchableOpacity style={styles.avatar} onPress={() => { setShowLanguagePicker(false); setShowSettings(true); }} accessibilityLabel={t("settings")}>
        <Text style={styles.avatarText}>{hasProfile ? savedProfile.name.charAt(0).toUpperCase() : "☼"}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderHome = () => (
    <>
      <View style={styles.welcomeBlock}>
        <Text style={styles.eyebrow}>
          {new Intl.DateTimeFormat(getLanguage(language).locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date()).toUpperCase()}
        </Text>
        <Text style={styles.heading}>{t("welcome")}{hasProfile ? `, ${savedProfile.name}` : ""} ✨</Text>
        <Text style={styles.subheading}>{t("clarity")}</Text>
      </View>

      {!hasProfile && (
        <TouchableOpacity style={styles.profilePrompt} onPress={openProfileForm}>
          <View style={styles.promptIcon}><Text style={styles.promptIconText}>✧</Text></View>
          <View style={styles.promptCopy}>
            <Text style={styles.cardTitle}>{t("createProfile")}</Text>
            <Text style={styles.bodyText}>{t("profilePrompt")}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      )}

      <View style={styles.horoscopeCard}>
        <View style={styles.cardTopLine}>
          <Text style={styles.cardOverline}>{t("todayHoroscope")}</Text>
          <Text style={styles.rashiBadge}>{hasProfile ? t("yourRashi") : t("chooseRashi")}</Text>
        </View>
        <Text style={styles.horoscopeTitle}>{hasProfile ? t("dayRhythm") : t("freshStart")}</Text>
        <Text style={styles.horoscopeCopy}>
          {t("homeReading")}
        </Text>
        <Text style={styles.sampleLabel}>{t("sampleReflection")}</Text>
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>{t("dayAtGlance")}</Text>
        <Text style={styles.sectionHint}>{t("localTime")}</Text>
      </View>
      <TouchableOpacity style={styles.panchangCard} onPress={() => openTab("Panchang")}>
        <View style={styles.panchangIcon}><Text style={styles.panchangIconText}>☼</Text></View>
        <View style={styles.panchangInfo}>
          <Text style={styles.cardTitle}>{t("todayPanchang")}</Text>
          <Text style={styles.bodyText}>{t("exploreTithi")}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      <View style={styles.quickGrid}>
        <TouchableOpacity style={styles.quickCard} onPress={() => openTab("Kundli")}>
          <Text style={styles.quickIcon}>☷</Text>
          <Text style={styles.quickTitle}>{t("quickBirthChart")}</Text>
          <Text style={styles.quickCaption}>{t("yourKundli")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickCard} onPress={() => openTab("Ask")}>
          <Text style={styles.quickIcon}>✧</Text>
          <Text style={styles.quickTitle}>{t("askQuestion").replace("...", "")}</Text>
          <Text style={styles.quickCaption}>{t("askGuidance")}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.premiumBanner} onPress={() => setShowPremium(true)}>
        <View>
          <Text style={styles.premiumEyebrow}>ASTROJYOTISH PLUS</Text>
          <Text style={styles.premiumTitle}>Go deeper, at your pace</Text>
          <Text style={styles.premiumCopy}>{t("removeSampleLimit")}</Text>
        </View>
        <View style={styles.pricePill}><Text style={styles.pricePillText}>₹99/mo</Text></View>
      </TouchableOpacity>
      <Text style={styles.disclaimer}>Astrology is for guidance and reflection, not a certainty.</Text>
    </>
  );

  const renderKundli = () => (
    <>
      <Text style={styles.eyebrow}>{t("personalChart")}</Text>
      <Text style={styles.heading}>{t("freeKundli")}</Text>
      <Text style={styles.subheading}>{t("skySnapshot")}</Text>
      {!hasProfile ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>✧</Text>
          <Text style={styles.cardTitle}>{t("startBirthDetails")}</Text>
          <Text style={[styles.bodyText, styles.centerText]}>{t("chartNeedsBirthDetails")}</Text>
          <PrimaryButton title={t("addBirthDetails")} onPress={openProfileForm} />
        </View>
      ) : (
        <>
          <View style={styles.chartCard}>
            <Text style={styles.cardOverline}>SIDEREAL BIRTH CHART</Text>
            {birthChart ? (
              <>
                <View style={styles.infoCard}>
                  <Text style={styles.cardTitle}>Ascendant · {birthChart.ascendant.sign.name}</Text>
                  <Text style={styles.bodyText}>
                    {formatPlanetPosition(birthChart.ascendant)} · {birthChart.ascendant.nakshatra} Pada {birthChart.ascendant.pada} · Whole-sign houses
                  </Text>
                  <Text style={styles.bodyText}>
                    Moon sign · {birthChart.planets.find((planet) => planet.name === "Moon")?.sign.name ?? "Unavailable"}
                  </Text>
                </View>
                {birthChart.planets.map((planet) => (
                  <PanchangRow
                    key={planet.name}
                    label={planet.name}
                    value={`${formatPlanetPosition(planet)} · ${planet.nakshatra} P${planet.pada} · H${planet.house}`}
                  />
                ))}
                <Text style={styles.sampleLabel}>
                  Astronomy Engine ephemeris · Lahiri ayanamsa approximation ({birthChart.ayanamsa.toFixed(2)}°) · Mean Rahu/Ketu
                </Text>
              </>
            ) : (
              <Text style={styles.bodyText}>A chart could not be calculated. Edit the birth details and try again.</Text>
            )}
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>{savedProfile.name}'s birth details</Text>
            <Text style={styles.bodyText}>{savedProfile.date} · {savedProfile.time}</Text>
            <Text style={styles.bodyText}>{savedProfile.place}</Text>
            {birthLocation ? (
              <>
                <Text style={styles.bodyText}>Matched location: {formatLocationName(birthLocation)}</Text>
                <Text style={styles.bodyText}>Birth time zone: {birthLocation.timezone}</Text>
              </>
            ) : null}
            <TouchableOpacity onPress={openProfileForm}><Text style={styles.textLink}>Edit details</Text></TouchableOpacity>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>Calculation notes</Text>
            <Text style={styles.bodyText}>
              Planet positions are calculated locally from an astronomical ephemeris and converted to the sidereal zodiac.
              Houses use the whole-sign method. This is not a professional astrology consultation.
            </Text>
          </View>
        </>
      )}
      <Text style={styles.disclaimer}>Astrology offers guidance for reflection; it cannot guarantee outcomes.</Text>
    </>
  );

  const renderPanchang = () => {
    const panchang = birthLocation ? calculateDailyPanchang(new Date(), birthLocation) : null;
    return (
    <>
      <Text style={styles.eyebrow}>{t("dayAtGlance")}</Text>
      <Text style={styles.heading}>{t("panchang")}</Text>
      <Text style={styles.subheading}>{t("exploreTithi")}</Text>
      <View style={styles.dateCard}>
        <Text style={styles.dateGlyph}>☼</Text>
        <View>
          <Text style={styles.cardTitle}>
            {birthLocation ? formatZonedDate(new Date(), birthLocation.timezone, getLanguage(language).locale) : "Select your birth place"}
          </Text>
          <Text style={styles.bodyText}>{birthLocation ? formatLocationName(birthLocation) : "Set a location for local timings"}</Text>
        </View>
        {!hasProfile ? <Text style={styles.chevron}>›</Text> : null}
      </View>
      {!hasProfile && (
        <TouchableOpacity onPress={openProfileForm}><Text style={styles.textLink}>Add your location</Text></TouchableOpacity>
      )}
      <View style={styles.infoCard}>
        <Text style={styles.cardOverline}>PANCHANG DETAILS</Text>
        {panchang ? (
          <>
            <PanchangRow label="Tithi" value={panchang.tithi} />
            <PanchangRow label="Nakshatra" value={panchang.nakshatra} />
            <PanchangRow label="Yoga" value={panchang.yoga} />
            <PanchangRow label="Karana" value={panchang.karana} />
          </>
        ) : (
          <>
            <PanchangRow label="Tithi" value="Save a birth profile to calculate" />
            <PanchangRow label="Nakshatra" value="Save a birth profile to calculate" />
            <PanchangRow label="Yoga" value="—" />
            <PanchangRow label="Karana" value="—" />
          </>
        )}
      </View>
      <View style={styles.infoCard}>
        <Text style={styles.cardOverline}>AUSPICIOUS & AVOIDABLE TIMES</Text>
        {panchang && birthLocation ? (
          <>
            <PanchangRow label="Sunrise" value={formatPanchangTime(panchang.sunrise, birthLocation.timezone, getLanguage(language).locale)} />
            <PanchangRow label="Sunset" value={formatPanchangTime(panchang.sunset, birthLocation.timezone, getLanguage(language).locale)} />
            <PanchangRow
              label="Rahu Kaal"
              value={
                panchang.rahuKaalStart && panchang.rahuKaalEnd
                  ? `${formatPanchangTime(panchang.rahuKaalStart, birthLocation.timezone, getLanguage(language).locale)} – ${formatPanchangTime(panchang.rahuKaalEnd, birthLocation.timezone, getLanguage(language).locale)}`
                  : "Unavailable for this date and location"
              }
            />
          </>
        ) : (
          <>
            <PanchangRow label="Rahu Kaal" value="Set a birth location for local timings" />
            <PanchangRow label="Auspicious timings" value="Set a birth location for local timings" />
          </>
        )}
      </View>
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          Panchang values use calculated Sun and Moon positions and local sunrise/sunset. They are provided for informational use and may differ from regional almanacs.
        </Text>
      </View>
    </>
    );
  };

  const renderAsk = () => (
    <>
      <Text style={styles.eyebrow}>{t("askGuidance")}</Text>
      <Text style={styles.heading}>{t("ask")}</Text>
      <Text style={styles.subheading}>{t("askGuidance")}</Text>
      {!hasProfile && (
        <TouchableOpacity style={styles.profilePrompt} onPress={openProfileForm}>
          <View style={styles.promptIcon}><Text style={styles.promptIconText}>✧</Text></View>
          <View style={styles.promptCopy}><Text style={styles.cardTitle}>Add a birth profile</Text><Text style={styles.bodyText}>A profile helps personalize your experience.</Text></View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      )}
      <View style={styles.chatWelcome}>
        <View style={styles.chatIcon}><Text style={styles.chatIconText}>✦</Text></View>
        <Text style={styles.cardTitle}>Hello{hasProfile ? `, ${savedProfile.name}` : ""}.</Text>
        <Text style={[styles.bodyText, styles.centerText]}>What’s on your mind? Start with career, relationships, or a new beginning.</Text>
      </View>
      {answer ? (
        <View style={styles.answerCard}>
          <Text style={styles.cardOverline}>ASTROJYOTISH · SAMPLE RESPONSE</Text>
          <Text style={styles.bodyText}>{answer}</Text>
        </View>
      ) : null}
      <View style={styles.questionBox}>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="Ask a question..."
          placeholderTextColor="#A6A2B0"
          style={styles.questionInput}
          multiline
          accessibilityLabel="Ask a question"
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendQuestion} accessibilityLabel="Send question">
          <Text style={styles.sendButtonText}>↑</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.usageText}>
        {hasPremium ? "AstroJyotish Plus · Sample question limit removed" : `${Math.max(0, 3 - askedQuestions)} of 3 free sample questions remaining`}
      </Text>
      <Text style={styles.disclaimer}>Responses are for reflection, not professional medical, financial or relationship advice.</Text>
      <TouchableOpacity style={styles.inlinePremium} onPress={() => setShowPremium(true)}><Text style={styles.textLink}>Explore Premium · ₹99/month</Text></TouchableOpacity>
    </>
  );

  const renderProfileForm = () => (
    <>
      <TouchableOpacity onPress={() => setShowProfileForm(false)}><Text style={styles.backLink}>‹  {t("back")}</Text></TouchableOpacity>
      <Text style={styles.eyebrow}>{t("profile")}</Text>
      <Text style={styles.heading}>{t("profile")}</Text>
      <Text style={styles.subheading}>{t("profilePrompt")}</Text>
      <View style={styles.formCard}>
        <FormField label={t("name")} value={profile.name} placeholder={t("yourName")} onChangeText={(text) => updateProfile("name", text)} />
        <FormField label={t("dateOfBirth")} value={profile.date} placeholder={t("dateHint")} onChangeText={(text) => updateProfile("date", text)} keyboardType="numbers-and-punctuation" />
        <FormField label={t("timeOfBirth")} value={profile.time} placeholder={t("timeHint")} onChangeText={(text) => updateProfile("time", text)} keyboardType="numbers-and-punctuation" />
        <FormField label={t("placeOfBirth")} value={profile.place} placeholder={t("placeHint")} onChangeText={(text) => updateProfile("place", text)} />
        <Text style={styles.privacyNote}>{t("privacyDetails")}</Text>
        {profileError ? <Text style={styles.errorText}>{profileError}</Text> : null}
        {locationCandidates.length > 0 ? (
          <View style={styles.locationChoices}>
            <Text style={styles.cardTitle}>{t("choosePlace")}</Text>
            {locationCandidates.map((location) => (
              <TouchableOpacity
                key={`${location.id}-${location.latitude}-${location.longitude}`}
                style={styles.locationChoice}
                onPress={() => saveProfileAtLocation(location)}
                accessibilityRole="button"
                accessibilityLabel={`Use location ${formatLocationName(location)}`}
              >
                <Text style={styles.cardTitle}>{formatLocationName(location)}</Text>
                <Text style={styles.bodyText}>Time zone: {location.timezone}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        <PrimaryButton
          title={isResolvingLocation ? t("findingPlace") : t("findPlace")}
          onPress={saveProfile}
          disabled={isResolvingLocation}
        />
        {isResolvingLocation ? <ActivityIndicator color={palette.purple} style={styles.loadingIndicator} /> : null}
      </View>
      <Text style={styles.disclaimer}>{t("birthAccuracy")}</Text>
    </>
  );

  const renderSettings = () => (
    <>
      <TouchableOpacity onPress={() => setShowSettings(false)}><Text style={styles.backLink}>‹  {t("back")}</Text></TouchableOpacity>
      <Text style={styles.eyebrow}>{t("settings")}</Text>
      <Text style={styles.heading}>{t("settings")}</Text>
      {hasProfile && (
        <TouchableOpacity style={styles.infoCard} onPress={openProfileForm}>
          <Text style={styles.cardOverline}>BIRTH PROFILE</Text>
          <Text style={styles.cardTitle}>{savedProfile.name}</Text>
          <Text style={styles.bodyText}>{savedProfile.date} · {savedProfile.place}</Text>
          <Text style={styles.textLink}>{t("editDetails")}</Text>
        </TouchableOpacity>
      )}
      <View style={styles.infoCard}>
        <Text style={styles.cardOverline}>{t("preferences")}</Text>
        <TouchableOpacity
          style={styles.panchangRow}
          onPress={() => setShowLanguagePicker(true)}
          accessibilityRole="button"
          accessibilityLabel={`${t("language")}: ${getLanguage(language).nativeName}`}
        >
          <Text style={styles.rowLabel}>{t("language")}</Text>
          <Text style={styles.rowValue}>{getLanguage(language).nativeName} ›</Text>
        </TouchableOpacity>
        <PanchangRow label={t("morningReminders")} value={t("notEnabled")} />
      </View>
      <TouchableOpacity style={styles.premiumBanner} onPress={() => { setShowSettings(false); setShowPremium(true); }}>
        <View><Text style={styles.premiumEyebrow}>ASTROJYOTISH PLUS</Text><Text style={styles.premiumTitle}>₹99 per month</Text><Text style={styles.premiumCopy}>{t("removeSampleLimit")}</Text></View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
      <View style={styles.notice}><Text style={styles.noticeText}>{t("privacyDetails")}</Text></View>
    </>
  );

  const renderPremium = () => (
    <>
      <TouchableOpacity onPress={() => setShowPremium(false)}><Text style={styles.backLink}>‹  {t("back")}</Text></TouchableOpacity>
      <View style={styles.premiumHero}>
        <Text style={styles.premiumStar}>✦</Text>
        <Text style={styles.premiumEyebrow}>ASTROJYOTISH PLUS</Text>
        <Text style={styles.premiumHeroTitle}>A little more{`\n`}cosmic clarity.</Text>
        <Text style={styles.premiumHeroCopy}>Thoughtful tools for your journey, whenever you need them.</Text>
      </View>
      <View style={styles.infoCard}>
        <PremiumFeature title="Unlimited chart-informed questions" detail="Remove the three-question sample limit while your subscription is active." />
        <PremiumFeature title="Verified subscription access" detail="The store and RevenueCat confirm whether AstroJyotish Plus is active." />
      </View>
      <View style={styles.purchaseCard}>
        <Text style={styles.price}>
          {monthlyPackage?.product.priceString ?? "₹99"} <Text style={styles.pricePeriod}>/ month</Text>
        </Text>
        <Text style={styles.bodyText}>Monthly subscription · Cancel anytime</Text>
        {hasPremium ? <Text style={styles.activeSubscription}>AstroJyotish Plus is active on this account.</Text> : null}
        {billingMessage ? <Text style={styles.errorText}>{billingMessage}</Text> : null}
        {Platform.OS === "android" && Constants.executionEnvironment === ExecutionEnvironment.StoreClient ? (
          <Text style={styles.terms}>Subscriptions require the Android development build; they are not available in Expo Go.</Text>
        ) : null}
        {!REVENUECAT_ANDROID_API_KEY && Platform.OS === "android" ? (
          <Text style={styles.terms}>Complete the RevenueCat setup and add its Android public SDK key to the local .env file.</Text>
        ) : null}
        <PrimaryButton
          title={hasPremium ? "Subscription active" : purchasePending ? "Contacting store..." : `Subscribe · ${monthlyPackage?.product.priceString ?? "₹99"}/month`}
          onPress={purchasePremium}
          disabled={purchasePending || hasPremium}
        />
        <TouchableOpacity onPress={restorePurchases} disabled={purchasePending} accessibilityRole="button">
          <Text style={styles.textLink}>Restore purchases</Text>
        </TouchableOpacity>
        <Text style={styles.terms}>
          Review the exact price and renewal terms in the store before confirming. Manage or cancel your subscription in your store account settings.
        </Text>
        <Text style={styles.terms}>
          Premium removes the sample question limit only. Replies are not AI-generated, and yearly reports are not available yet.
        </Text>
      </View>
      <Text style={styles.disclaimer}>Astrology is guidance for reflection, not a guarantee or substitute for professional advice.</Text>
    </>
  );

  const renderContent = () => {
    if (showProfileForm) return renderProfileForm();
    if (showLanguagePicker) return renderLanguagePicker();
    if (showSettings) return renderSettings();
    if (showPremium) return renderPremium();
    switch (activeTab) {
      case "Kundli": return renderKundli();
      case "Panchang": return renderPanchang();
      case "Ask": return renderAsk();
      default: return renderHome();
    }
  };

  const renderLanguagePicker = () => (
    <>
      <TouchableOpacity onPress={() => setShowLanguagePicker(false)}>
        <Text style={styles.backLink}>‹  {t("back")}</Text>
      </TouchableOpacity>
      <Text style={styles.eyebrow}>{t("settings").toUpperCase()}</Text>
      <Text style={styles.heading}>{t("selectLanguage")}</Text>
      <View style={styles.infoCard}>
        {languages.map((option) => (
          <TouchableOpacity
            key={option.code}
            style={styles.panchangRow}
            onPress={() => {
              const usesRTL = option.code === "ks" || option.code === "sd" || option.code === "ur";
              setLanguage(option.code);
              setShowLanguagePicker(false);
              if (I18nManager.isRTL !== usesRTL) {
                Alert.alert("Restart required", "Close and reopen the app to apply right-to-left layout.");
              }
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: language === option.code }}
          >
            <Text style={styles.rowLabel}>{option.nativeName}</Text>
            <Text style={styles.rowValue}>{language === option.code ? "✓" : option.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );

  if (!languageLoaded) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.flex]}>
        <ActivityIndicator color={palette.purple} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {renderHeader()}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {renderContent()}
        </ScrollView>
      </KeyboardAvoidingView>
      {!showProfileForm && !showSettings && !showPremium && !showLanguagePicker && (
        <View style={styles.tabBar}>
          {(["Home", "Kundli", "Panchang", "Ask"] as Tab[]).map((tab) => (
            <TouchableOpacity key={tab} style={styles.tabItem} onPress={() => openTab(tab)} accessibilityRole="button" accessibilityState={{ selected: activeTab === tab }}>
              <Text style={[styles.tabIcon, activeTab === tab && styles.tabIconActive]}>{tab === "Home" ? "⌂" : tab === "Kundli" ? "◈" : tab === "Panchang" ? "☼" : "✧"}</Text>
              <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>{t(tab.toLowerCase() as TranslationKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

function FormField({
  label,
  value,
  placeholder,
  onChangeText,
  keyboardType = "default",
}: {
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (text: string) => void;
  keyboardType?: React.ComponentProps<typeof TextInput>["keyboardType"];
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        placeholder={placeholder}
        placeholderTextColor="#A6A2B0"
        onChangeText={onChangeText}
        style={styles.fieldInput}
        accessibilityLabel={label}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === "default" ? "words" : "none"}
      />
    </View>
  );
}

function PrimaryButton({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <TouchableOpacity style={[styles.primaryButton, disabled && styles.disabledButton]} onPress={onPress} disabled={disabled}><Text style={styles.primaryButtonText}>{title}</Text></TouchableOpacity>;
}

function PanchangRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.panchangRow}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>;
}

function PremiumFeature({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureCheck}><Text style={styles.featureCheckText}>✓</Text></View>
      <View style={styles.featureText}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.bodyText}>{detail}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.cream },
  flex: { flex: 1 },
  topBar: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: palette.cream },
  brand: { fontSize: 17, fontWeight: "700", color: palette.ink, letterSpacing: 0.1 },
  brandCaption: { fontSize: 11, color: palette.muted, marginTop: 3 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#EDE7F7", alignItems: "center", justifyContent: "center" },
  avatarText: { color: palette.purple, fontSize: 17, fontWeight: "700" },
  content: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 30 },
  welcomeBlock: { marginBottom: 22 },
  eyebrow: { color: palette.gold, fontSize: 10, letterSpacing: 1.5, fontWeight: "700", marginBottom: 10 },
  heading: { color: palette.ink, fontSize: 29, fontWeight: "700", letterSpacing: -0.5 },
  subheading: { color: palette.muted, fontSize: 14, lineHeight: 21, marginTop: 6, marginBottom: 20 },
  profilePrompt: { backgroundColor: palette.white, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", marginBottom: 16, borderWidth: 1, borderColor: palette.line },
  promptIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: palette.purpleLight, alignItems: "center", justifyContent: "center" },
  promptIconText: { color: palette.purple, fontSize: 20 },
  promptCopy: { flex: 1, marginLeft: 12 },
  chevron: { color: palette.purple, fontSize: 25, marginLeft: 8 },
  cardTitle: { color: palette.ink, fontSize: 14, fontWeight: "700" },
  bodyText: { color: palette.muted, fontSize: 12, lineHeight: 19, marginTop: 4 },
  horoscopeCard: { backgroundColor: palette.purple, borderRadius: 20, padding: 20, marginBottom: 24 },
  cardTopLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardOverline: { color: palette.gold, fontSize: 9, letterSpacing: 1.3, fontWeight: "700", marginBottom: 12 },
  rashiBadge: { color: "#E2D9FB", fontSize: 8, letterSpacing: 1, fontWeight: "700" },
  horoscopeTitle: { color: palette.white, fontSize: 20, fontWeight: "700", marginTop: 14 },
  horoscopeCopy: { color: "#E9E5F5", fontSize: 13, lineHeight: 21, marginTop: 8 },
  sampleLabel: { color: "#BEB4DA", fontSize: 9, marginTop: 14 },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { color: palette.ink, fontSize: 16, fontWeight: "700" },
  sectionHint: { color: palette.muted, fontSize: 8, letterSpacing: 1, fontWeight: "700" },
  panchangCard: { borderRadius: 16, padding: 14, backgroundColor: palette.white, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: palette.line, marginBottom: 14 },
  panchangIcon: { backgroundColor: "#FFF3D9", width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  panchangIconText: { color: palette.gold, fontSize: 20 },
  panchangInfo: { flex: 1, marginLeft: 12 },
  quickGrid: { flexDirection: "row", gap: 12, marginBottom: 20 },
  quickCard: { flex: 1, padding: 15, backgroundColor: palette.white, borderRadius: 16, borderWidth: 1, borderColor: palette.line },
  quickIcon: { color: palette.purple, fontSize: 22, marginBottom: 12 },
  quickTitle: { color: palette.ink, fontSize: 13, fontWeight: "700" },
  quickCaption: { color: palette.muted, fontSize: 10, marginTop: 4 },
  premiumBanner: { backgroundColor: "#302A45", borderRadius: 17, padding: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  premiumEyebrow: { color: "#DBC391", fontSize: 9, fontWeight: "700", letterSpacing: 1.4 },
  premiumTitle: { color: palette.white, fontSize: 15, fontWeight: "700", marginTop: 7 },
  premiumCopy: { color: "#C3BDCF", fontSize: 11, marginTop: 4 },
  pricePill: { backgroundColor: "#E5C889", borderRadius: 14, paddingVertical: 8, paddingHorizontal: 10 },
  pricePillText: { color: "#302A45", fontSize: 11, fontWeight: "700" },
  disclaimer: { color: "#9B97A5", fontSize: 10, textAlign: "center", lineHeight: 15, marginTop: 8, marginBottom: 8 },
  tabBar: { height: 66, borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.white, flexDirection: "row", justifyContent: "space-around", alignItems: "center", paddingBottom: Platform.OS === "ios" ? 5 : 0 },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center", height: "100%" },
  tabIcon: { fontSize: 20, color: "#A6A2B0", height: 25 },
  tabIconActive: { color: palette.purple },
  tabLabel: { fontSize: 9, color: "#A6A2B0", marginTop: 2 },
  tabLabelActive: { color: palette.purple, fontWeight: "700" },
  emptyState: { backgroundColor: palette.white, borderRadius: 20, padding: 25, alignItems: "center", marginTop: 16, borderWidth: 1, borderColor: palette.line },
  emptyIcon: { fontSize: 35, color: palette.purple, marginBottom: 14 },
  centerText: { textAlign: "center", marginVertical: 6 },
  primaryButton: { backgroundColor: palette.purple, paddingVertical: 14, paddingHorizontal: 18, borderRadius: 13, alignItems: "center", marginTop: 16 },
  disabledButton: { opacity: 0.6 },
  primaryButtonText: { color: palette.white, fontSize: 13, fontWeight: "700" },
  chartCard: { backgroundColor: palette.white, borderRadius: 18, padding: 16, marginTop: 5, borderWidth: 1, borderColor: palette.line },
  chartGrid: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderLeftWidth: 1, borderColor: "#E8E2EF", marginTop: 6 },
  chartCell: { width: "25%", height: 75, borderRightWidth: 1, borderBottomWidth: 1, borderColor: "#E8E2EF", alignItems: "center", justifyContent: "center" },
  chartCellLast: { borderRightWidth: 0 },
  chartCellSign: { color: palette.gold, fontSize: 17, marginBottom: 4 },
  chartCellLabel: { color: palette.muted, fontSize: 9 },
  infoCard: { backgroundColor: palette.white, padding: 17, borderRadius: 16, marginTop: 14, borderWidth: 1, borderColor: palette.line },
  textLink: { color: palette.purple, fontSize: 12, fontWeight: "700", marginTop: 12 },
  dateCard: { backgroundColor: palette.white, padding: 15, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: palette.line, marginTop: 3, marginBottom: 15 },
  dateGlyph: { color: palette.gold, fontSize: 24, marginRight: 12 },
  panchangRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F3F0F5" },
  rowLabel: { color: palette.ink, fontSize: 12, fontWeight: "600" },
  rowValue: { color: palette.muted, fontSize: 11, textAlign: "right", flexShrink: 1, marginLeft: 12 },
  notice: { backgroundColor: "#F2EFF8", padding: 13, borderRadius: 13, marginTop: 14 },
  noticeText: { color: "#625A78", fontSize: 11, lineHeight: 17 },
  chatWelcome: { alignItems: "center", backgroundColor: palette.white, borderRadius: 18, padding: 24, marginTop: 8, borderWidth: 1, borderColor: palette.line },
  chatIcon: { backgroundColor: palette.purpleLight, height: 48, width: 48, borderRadius: 17, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  chatIconText: { color: palette.purple, fontSize: 22 },
  answerCard: { backgroundColor: palette.white, borderRadius: 15, padding: 16, marginTop: 15, borderWidth: 1, borderColor: palette.line },
  questionBox: { backgroundColor: palette.white, borderWidth: 1, borderColor: "#E3DEEB", borderRadius: 16, padding: 8, marginTop: 20, flexDirection: "row", alignItems: "flex-end" },
  questionInput: { flex: 1, color: palette.ink, fontSize: 13, paddingHorizontal: 9, paddingTop: 10, paddingBottom: 9, minHeight: 43, maxHeight: 100 },
  sendButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: palette.purple, alignItems: "center", justifyContent: "center" },
  sendButtonText: { color: palette.white, fontSize: 20, fontWeight: "700" },
  usageText: { textAlign: "center", color: palette.muted, fontSize: 10, marginTop: 11 },
  inlinePremium: { alignItems: "center", marginTop: 5 },
  backLink: { color: palette.purple, fontSize: 13, fontWeight: "600", marginBottom: 22, paddingVertical: 4 },
  formCard: { backgroundColor: palette.white, borderRadius: 18, padding: 17, borderWidth: 1, borderColor: palette.line },
  formField: { marginBottom: 16 },
  fieldLabel: { color: palette.ink, fontSize: 12, fontWeight: "700", marginBottom: 7 },
  fieldInput: { borderColor: "#E7E2EC", borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 12, color: palette.ink, fontSize: 13, backgroundColor: "#FFFEFC" },
  privacyNote: { backgroundColor: "#F5F2F9", padding: 11, borderRadius: 10, color: "#6F687D", fontSize: 10, lineHeight: 16 },
  errorText: { color: "#A83232", fontSize: 12, lineHeight: 18, marginTop: 12 },
  locationChoices: { marginTop: 16 },
  locationChoice: { backgroundColor: "#FFFEFC", borderColor: palette.line, borderWidth: 1, borderRadius: 11, padding: 12, marginTop: 9 },
  loadingIndicator: { marginTop: 12 },
  premiumHero: { backgroundColor: "#302A45", borderRadius: 21, padding: 23, alignItems: "center", marginTop: 4 },
  premiumStar: { color: "#E5C889", fontSize: 30, marginBottom: 13 },
  premiumHeroTitle: { color: palette.white, fontSize: 30, lineHeight: 36, fontWeight: "700", textAlign: "center", marginTop: 12 },
  premiumHeroCopy: { color: "#C3BDCF", textAlign: "center", fontSize: 12, lineHeight: 19, marginTop: 10 },
  featureRow: { flexDirection: "row", alignItems: "center", paddingVertical: 11 },
  featureCheck: { backgroundColor: "#EEEBF8", height: 29, width: 29, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 12 },
  featureCheckText: { color: palette.purple, fontWeight: "700", fontSize: 13 },
  featureText: { flex: 1 },
  purchaseCard: { backgroundColor: palette.white, padding: 19, borderRadius: 17, marginTop: 14, borderWidth: 1, borderColor: palette.line, alignItems: "center" },
  activeSubscription: { color: palette.green, fontSize: 12, fontWeight: "700", textAlign: "center", marginTop: 12 },
  price: { color: palette.ink, fontSize: 31, fontWeight: "700" },
  pricePeriod: { color: palette.muted, fontSize: 14, fontWeight: "400" },
  terms: { color: "#918D9B", fontSize: 9, lineHeight: 14, textAlign: "center", marginTop: 12 },
});
