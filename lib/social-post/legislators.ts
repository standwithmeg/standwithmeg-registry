import { US_JURISDICTION_NAMES } from "../us-jurisdictions";
import { enrichSocials, formatSocialLinkLine } from "./legislator-builders";

export function stateName(abbr: string): string {
  return US_JURISDICTION_NAMES[abbr.toUpperCase() as keyof typeof US_JURISDICTION_NAMES] ?? abbr;
}

export const STATE_CAPITOL: Record<string, { building: string; city: string }> = {
  AL: { building: "Alabama State Capitol", city: "Montgomery" },
  AK: { building: "Alaska State Capitol", city: "Juneau" },
  AZ: { building: "Arizona State Capitol", city: "Phoenix" },
  AR: { building: "Arkansas State Capitol", city: "Little Rock" },
  CA: { building: "California State Capitol", city: "Sacramento" },
  CO: { building: "Colorado State Capitol", city: "Denver" },
  CT: { building: "Connecticut State Capitol", city: "Hartford" },
  DE: { building: "Delaware State Capitol", city: "Dover" },
  FL: { building: "Florida State Capitol", city: "Tallahassee" },
  GA: { building: "Georgia State Capitol", city: "Atlanta" },
  HI: { building: "Hawaii State Capitol", city: "Honolulu" },
  ID: { building: "Idaho State Capitol", city: "Boise" },
  IL: { building: "Illinois State Capitol", city: "Springfield" },
  IN: { building: "Indiana Statehouse", city: "Indianapolis" },
  IA: { building: "Iowa State Capitol", city: "Des Moines" },
  KS: { building: "Kansas State Capitol", city: "Topeka" },
  KY: { building: "Kentucky State Capitol", city: "Frankfort" },
  LA: { building: "Louisiana State Capitol", city: "Baton Rouge" },
  ME: { building: "Maine State House", city: "Augusta" },
  MD: { building: "Maryland State House", city: "Annapolis" },
  MA: { building: "Massachusetts State House", city: "Boston" },
  MI: { building: "Michigan State Capitol", city: "Lansing" },
  MN: { building: "Minnesota State Capitol", city: "Saint Paul" },
  MS: { building: "Mississippi State Capitol", city: "Jackson" },
  MO: { building: "Missouri State Capitol", city: "Jefferson City" },
  MT: { building: "Montana State Capitol", city: "Helena" },
  NE: { building: "Nebraska State Capitol", city: "Lincoln" },
  NV: { building: "Nevada State Capitol", city: "Carson City" },
  NH: { building: "New Hampshire State House", city: "Concord" },
  NJ: { building: "New Jersey State House", city: "Trenton" },
  NM: { building: "New Mexico State Capitol", city: "Santa Fe" },
  NY: { building: "New York State Capitol", city: "Albany" },
  NC: { building: "North Carolina State Capitol", city: "Raleigh" },
  ND: { building: "North Dakota State Capitol", city: "Bismarck" },
  OH: { building: "Ohio Statehouse", city: "Columbus" },
  OK: { building: "Oklahoma State Capitol", city: "Oklahoma City" },
  OR: { building: "Oregon State Capitol", city: "Salem" },
  PA: { building: "Pennsylvania State Capitol", city: "Harrisburg" },
  RI: { building: "Rhode Island State House", city: "Providence" },
  SC: { building: "South Carolina State House", city: "Columbia" },
  SD: { building: "South Dakota State Capitol", city: "Pierre" },
  TN: { building: "Tennessee State Capitol", city: "Nashville" },
  TX: { building: "Texas State Capitol", city: "Austin" },
  UT: { building: "Utah State Capitol", city: "Salt Lake City" },
  VT: { building: "Vermont State House", city: "Montpelier" },
  VA: { building: "Virginia State Capitol", city: "Richmond" },
  WA: { building: "Washington State Capitol", city: "Olympia" },
  WV: { building: "West Virginia State Capitol", city: "Charleston" },
  WI: { building: "Wisconsin State Capitol", city: "Madison" },
  WY: { building: "Wyoming State Capitol", city: "Cheyenne" },
};

export function stateCapitolTag(stateAbbr: string): string {
  const st = stateAbbr.toUpperCase();
  const cap = STATE_CAPITOL[st];
  if (!cap) return `${stateName(st)} State Capitol`;
  return `${cap.building}, ${cap.city}, ${st}`;
}

export type CongressPick = {
  party: "D" | "R";
  name: string;
  title: string;
  handle?: string;
  profile_url?: string;
  socials?: LegislatorSocialLink[];
  note?: string;
};

export type StateLegislatorPick = {
  party: "D" | "R" | "NP" | null;
  name: string;
  title: string;
  chamber: "senate" | "house";
  handle?: string;
  profile_url?: string;
  socials?: LegislatorSocialLink[];
  note?: string;
};

export type LegislatorSocialLink = {
  platform: "X" | "Facebook" | "Instagram" | "Official" | "Campaign";
  handle?: string;
  url: string;
};

// Standing roster pulled from _PLAYBOOK-STATE-COURT-ACTOR-POSTS.md.
// For each state we list one Democrat and one Republican option.
// If both senators are the same party, the opposite-party option is a House member or state leader.
type CongressOption = { name: string; title: string; handle?: string; profile_url?: string; socials?: LegislatorSocialLink[]; note?: string };

const CONGRESS_ROSTER: Record<string, { D: CongressOption[]; R: CongressOption[] }> = {
  AL: {
    D: [{ name: "Shomari Figures", title: "U.S. Rep. (AL-02)", handle: "@repscfigures", profile_url: "https://x.com/repscfigures" }],
    R: [
      { name: "Barry Moore", title: "U.S. Rep. (AL-01)", handle: "@RepBarryMoore", profile_url: "https://x.com/RepBarryMoore", note: "covers Baldwin Co." },
      { name: "Katie Britt", title: "U.S. Senator", handle: "@SenKatieBritt", profile_url: "https://x.com/SenKatieBritt" },
      { name: "Tommy Tuberville", title: "U.S. Senator", handle: "@SenTuberville", profile_url: "https://x.com/SenTuberville" },
      { name: "Gary Palmer", title: "U.S. Rep. (AL-06)", handle: "@USRepGaryPalmer", profile_url: "https://x.com/USRepGaryPalmer" },
    ],
  },
  AR: {
    D: [
      {
        name: "Andrew Collins",
        title: "AR House Minority Leader",
        handle: "@andrewcollinsAR",
        profile_url: "https://x.com/andrewcollinsAR",
        note: "no federal D in AR",
      },
    ],
    R: [
      { name: "Steve Womack", title: "U.S. Rep. (AR-03)", handle: "@rep_stevewomack", profile_url: "https://x.com/rep_stevewomack", note: "Sebastian Co. area" },
      { name: "John Boozman", title: "U.S. Senator", handle: "@JohnBoozman", profile_url: "https://x.com/JohnBoozman" },
      { name: "Tom Cotton", title: "U.S. Senator", handle: "@SenTomCotton", profile_url: "https://x.com/SenTomCotton" },
    ],
  },
  CT: {
    D: [
      { name: "Richard Blumenthal", title: "U.S. Senator", handle: "@SenBlumenthal", profile_url: "https://x.com/SenBlumenthal" },
      { name: "Chris Murphy", title: "U.S. Senator", handle: "@ChrisMurphyCT", profile_url: "https://x.com/ChrisMurphyCT" },
    ],
    R: [
      {
        name: "Stephen Harding",
        title: "CT Senate GOP Leader",
        handle: "@senatorharding",
        profile_url: "https://www.facebook.com/senatorharding",
        socials: [
          { platform: "Facebook", handle: "@senatorharding", url: "https://www.facebook.com/senatorharding" },
        ],
        note: "no federal R in CT; X handle unverified",
      },
    ],
  },
  FL: {
    D: [
      {
        name: "Jared Moskowitz",
        title: "U.S. Rep. (FL-23)",
        handle: "@RepMoskowitz",
        profile_url: "https://x.com/RepMoskowitz",
        socials: [
          { platform: "X", handle: "@RepMoskowitz", url: "https://x.com/RepMoskowitz" },
          { platform: "Facebook", handle: "@RepMoskowitz", url: "https://www.facebook.com/RepMoskowitz/" },
          { platform: "Instagram", handle: "@repjaredmoskowitz", url: "https://www.instagram.com/repjaredmoskowitz/" },
        ],
        note: "Broward Co.",
      },
      { name: "Debbie Wasserman Schultz", title: "U.S. Rep. (FL-25)", handle: "@RepDWStweets", profile_url: "https://x.com/RepDWStweets", note: "Broward/Palm Beach" },
      { name: "Sheila Cherfilus-McCormick", title: "U.S. Rep. (FL-20)", handle: "@RepCherfilus", profile_url: "https://x.com/RepCherfilus", note: "Broward/Palm Beach" },
    ],
    R: [
      { name: "Rick Scott", title: "U.S. Senator", handle: "@SenRickScott", profile_url: "https://x.com/SenRickScott" },
      { name: "Ashley Moody", title: "U.S. Senator", handle: "@SenAshleyMoody", profile_url: "https://x.com/SenAshleyMoody" },
      { name: "Randy Fine", title: "U.S. Rep. (FL-06)", handle: "@VoteRandyFine", profile_url: "https://x.com/VoteRandyFine", note: "Volusia/Brevard area" },
    ],
  },
  IA: {
    D: [
      {
        name: "Janice Weiner",
        title: "IA Senate Democratic Leader",
        handle: "@JaniceWeinerIA",
        profile_url: "https://x.com/JaniceWeinerIA",
        socials: [
          { platform: "X", handle: "@JaniceWeinerIA", url: "https://x.com/JaniceWeinerIA" },
          { platform: "Facebook", handle: "@janiceweineria", url: "https://www.facebook.com/janiceweineria/" },
          { platform: "Official", url: "https://www.legis.iowa.gov/legislators/legislator?ga=91&personID=30688" },
        ],
        note: "no federal D in IA",
      },
    ],
    R: [
      { name: "Zach Nunn", title: "U.S. Rep. (IA-03)", handle: "@ZachNunn", profile_url: "https://x.com/ZachNunn", note: "covers Wapello Co." },
      { name: "Chuck Grassley", title: "U.S. Senator", handle: "@ChuckGrassley", profile_url: "https://x.com/ChuckGrassley" },
      { name: "Joni Ernst", title: "U.S. Senator", handle: "@SenJoniErnst", profile_url: "https://x.com/SenJoniErnst" },
    ],
  },
  IN: {
    D: [
      { name: "André Carson", title: "U.S. Rep. (IN-07)", handle: "@RepAndreCarson", profile_url: "https://x.com/RepAndreCarson" },
      { name: "Frank Mrvan", title: "U.S. Rep. (IN-01)", handle: "@RepMrvan", profile_url: "https://x.com/RepMrvan" },
    ],
    R: [
      { name: "Rudy Yakym", title: "U.S. Rep. (IN-02)", handle: "@RepRudyYakym", profile_url: "https://x.com/RepRudyYakym", note: "covers Elkhart Co." },
      { name: "Todd Young", title: "U.S. Senator", handle: "@SenToddYoung", profile_url: "https://x.com/SenToddYoung" },
      { name: "Jim Banks", title: "U.S. Senator", handle: "@SenatorBanks", profile_url: "https://x.com/SenatorBanks" },
    ],
  },
  KS: {
    D: [{ name: "Sharice Davids", title: "U.S. Rep. (KS-03)", handle: "@RepDavids", profile_url: "https://x.com/RepDavids", note: "only KS federal Democrat" }],
    R: [
      { name: "Roger Marshall", title: "U.S. Senator", handle: "@RogerMarshallMD", profile_url: "https://x.com/RogerMarshallMD" },
      { name: "Jerry Moran", title: "U.S. Senator", handle: "@JerryMoran", profile_url: "https://x.com/JerryMoran" },
      { name: "Derek Schmidt", title: "U.S. Rep. (KS-02)", handle: "@RepDerekSchmidt", profile_url: "https://x.com/RepDerekSchmidt", note: "eastern KS / Miami" },
    ],
  },
  MA: {
    D: [
      { name: "Elizabeth Warren", title: "U.S. Senator", handle: "@SenWarren", profile_url: "https://x.com/SenWarren" },
      { name: "Ed Markey", title: "U.S. Senator", handle: "@SenMarkey", profile_url: "https://x.com/SenMarkey" },
    ],
    R: [
      {
        name: "Bruce Tarr",
        title: "MA Senate Minority Leader",
        profile_url: "https://www.facebook.com/SenatorBruceTarr/",
        socials: [
          { platform: "Facebook", handle: "@SenatorBruceTarr", url: "https://www.facebook.com/SenatorBruceTarr/" },
          { platform: "Official", url: "https://malegislature.gov/Legislators/Profile/BRT1" },
        ],
        note: "no federal R in MA",
      },
    ],
  },
  MI: {
    D: [{ name: "Elissa Slotkin", title: "U.S. Senator", handle: "@SenatorSlotkin", profile_url: "https://x.com/SenatorSlotkin", note: "statewide; rotation 2026-06-16" }],
    R: [
      { name: "Lisa McClain", title: "U.S. Rep. (MI-09)", handle: "@RepLisaMcClain", profile_url: "https://x.com/RepLisaMcClain", note: "the Thumb" },
      { name: "John James", title: "U.S. Rep. (MI-10)", handle: "@JohnJamesMI", profile_url: "https://x.com/JohnJamesMI", note: "SE Oakland/Macomb" },
    ],
  },
  NC: {
    D: [
      { name: "Don Davis", title: "U.S. Rep. (NC-01)", handle: "@RepDonDavis", profile_url: "https://x.com/RepDonDavis", note: "eastern NC" },
      { name: "Deborah Ross", title: "U.S. Rep. (NC-02)", handle: "@RepDeborahRoss", profile_url: "https://x.com/RepDeborahRoss" },
      { name: "Valerie Foushee", title: "U.S. Rep. (NC-04)", handle: "@RepFoushee", profile_url: "https://x.com/RepFoushee" },
      { name: "Alma Adams", title: "U.S. Rep. (NC-12)", handle: "@RepAdams", profile_url: "https://x.com/RepAdams" },
    ],
    R: [
      { name: "Greg Murphy", title: "U.S. Rep. (NC-03)", handle: "@RepGregMurphy", profile_url: "https://x.com/RepGregMurphy", note: "Lenoir Co. post-2026 maps" },
      { name: "Ted Budd", title: "U.S. Senator", handle: "@SenTedBuddNC", profile_url: "https://x.com/SenTedBuddNC" },
      { name: "Thom Tillis", title: "U.S. Senator", handle: "@SenThomTillis", profile_url: "https://x.com/SenThomTillis", note: "retiring 2026" },
    ],
  },
  NE: {
    D: [
      {
        name: "Machaela Cavanaugh",
        title: "NE State Senator (LD-6)",
        handle: "@MachaelaCavanaugh",
        profile_url: "https://x.com/MachaelaCavanaugh",
        socials: [
          { platform: "X", handle: "@MachaelaCavanaugh", url: "https://x.com/MachaelaCavanaugh" },
          { platform: "Facebook", handle: "@MachaelaCavanaugh", url: "https://www.facebook.com/MachaelaCavanaugh/" },
          { platform: "Official", url: "https://nebraskalegislature.gov/senators/legislator?District=6" },
        ],
        note: "no federal D; unicameral nonpartisan",
      },
      {
        name: "John Cavanaugh",
        title: "NE State Senator (LD-9)",
        handle: "@JohnCavanaughNE",
        profile_url: "https://x.com/JohnCavanaughNE",
        socials: [
          { platform: "X", handle: "@JohnCavanaughNE", url: "https://x.com/JohnCavanaughNE" },
          { platform: "Official", url: "https://nebraskalegislature.gov/senators/legislator?District=9" },
        ],
        note: "no federal D; unicameral nonpartisan",
      },
    ],
    R: [
      { name: "Adrian Smith", title: "U.S. Rep. (NE-03)", handle: "@RepAdrianSmith", profile_url: "https://x.com/RepAdrianSmith", note: "Scotts Bluff/panhandle" },
      { name: "Don Bacon", title: "U.S. Rep. (NE-02)", handle: "@RepDonBacon", profile_url: "https://x.com/RepDonBacon", note: "Omaha area" },
      { name: "Deb Fischer", title: "U.S. Senator", handle: "@SenatorFischer", profile_url: "https://x.com/SenatorFischer" },
      { name: "Pete Ricketts", title: "U.S. Senator", handle: "@SenatorRicketts", profile_url: "https://x.com/SenatorRicketts" },
    ],
  },
  NV: {
    D: [
      { name: "Dina Titus", title: "U.S. Rep. (NV-01)", handle: "@repdinatitus", profile_url: "https://x.com/repdinatitus", note: "Las Vegas core" },
      { name: "Susie Lee", title: "U.S. Rep. (NV-03)", handle: "@RepSusieLee", profile_url: "https://x.com/RepSusieLee" },
      { name: "Steven Horsford", title: "U.S. Rep. (NV-04)", handle: "@RepHorsford", profile_url: "https://x.com/RepHorsford" },
      { name: "Catherine Cortez Masto", title: "U.S. Senator", handle: "@SenCortezMasto", profile_url: "https://x.com/SenCortezMasto" },
      { name: "Jacky Rosen", title: "U.S. Senator", handle: "@SenJackyRosen", profile_url: "https://x.com/SenJackyRosen" },
    ],
    R: [{ name: "Mark Amodei", title: "U.S. Rep. (NV-02)", handle: "@MarkAmodeiNV2", profile_url: "https://x.com/MarkAmodeiNV2", note: "only federal Republican in NV" }],
  },
  NY: {
    D: [
      { name: "Joe Morelle", title: "U.S. Rep. (NY-25)", handle: "@RepJoeMorelle", profile_url: "https://x.com/RepJoeMorelle", note: "Monroe Co./Rochester" },
      { name: "Chuck Schumer", title: "U.S. Senator", handle: "@SenSchumer", profile_url: "https://x.com/SenSchumer" },
      { name: "Kirsten Gillibrand", title: "U.S. Senator", handle: "@SenGillibrand", profile_url: "https://x.com/SenGillibrand" },
    ],
    R: [
      { name: "Claudia Tenney", title: "U.S. Rep. (NY-24)", handle: "@RepTenney", profile_url: "https://x.com/RepTenney", note: "adjacent to Monroe/Rochester" },
      { name: "Nick Langworthy", title: "U.S. Rep. (NY-23)", handle: "@RepLangworthy", profile_url: "https://x.com/RepLangworthy" },
      { name: "Elise Stefanik", title: "U.S. Rep. (NY-21)", handle: "@EliseStefanik", profile_url: "https://x.com/EliseStefanik" },
    ],
  },
  OH: {
    D: [
      { name: "Greg Landsman", title: "U.S. Rep. (OH-01)", handle: "@RepGregLandsman", profile_url: "https://x.com/RepGregLandsman" },
      { name: "Marcy Kaptur", title: "U.S. Rep. (OH-09)", handle: "@RepMarcyKaptur", profile_url: "https://x.com/RepMarcyKaptur" },
      { name: "Joyce Beatty", title: "U.S. Rep. (OH-03)", handle: "@RepBeatty", profile_url: "https://x.com/RepBeatty" },
      { name: "Emilia Sykes", title: "U.S. Rep. (OH-13)", handle: "@RepEmiliaSykes", profile_url: "https://x.com/RepEmiliaSykes" },
    ],
    R: [
      { name: "Jim Jordan", title: "U.S. Rep. (OH-04), Chair House Judiciary", handle: "@Jim_Jordan", profile_url: "https://x.com/Jim_Jordan", note: "Richland Co. area" },
      { name: "Bernie Moreno", title: "U.S. Senator", handle: "@berniemoreno", profile_url: "https://x.com/berniemoreno" },
      { name: "Jon Husted", title: "U.S. Senator", handle: "@SenJonHusted", profile_url: "https://x.com/SenJonHusted" },
    ],
  },
  OK: {
    D: [
      {
        name: "Cyndi Munson",
        title: "OK House Democratic Leader",
        handle: "@CyndiMunsonOK",
        profile_url: "https://www.facebook.com/CyndiMunsonOK/",
        socials: [
          { platform: "Facebook", handle: "@CyndiMunsonOK", url: "https://www.facebook.com/CyndiMunsonOK/" },
          { platform: "Official", url: "https://www.okhouse.gov/representatives/cyndi-munson" },
        ],
        note: "state leader; no federal D in OK",
      },
      {
        name: "Julia Kirt",
        title: "OK Senate Democratic Leader",
        handle: "@JuliaKirt",
        profile_url: "https://x.com/JuliaKirt",
        socials: [
          { platform: "X", handle: "@JuliaKirt", url: "https://x.com/JuliaKirt" },
          { platform: "Instagram", handle: "@juliakirt", url: "https://www.instagram.com/juliakirt/" },
          { platform: "Facebook", handle: "@kirt4ok", url: "https://www.facebook.com/kirt4ok/" },
          { platform: "Official", url: "https://oksenate.gov/senators/julia-kirt" },
        ],
        note: "state leader; no federal D in OK",
      },
    ],
    R: [
      {
        name: "James Lankford",
        title: "U.S. Senator",
        handle: "@SenatorLankford",
        profile_url: "https://x.com/SenatorLankford",
        socials: [
          { platform: "X", handle: "@SenatorLankford", url: "https://x.com/SenatorLankford" },
          { platform: "Facebook", handle: "@SenatorLankford", url: "https://www.facebook.com/SenatorLankford/" },
        ],
      },
      {
        name: "Markwayne Mullin",
        title: "U.S. Senator",
        handle: "@SenMullin",
        profile_url: "https://x.com/SenMullin",
        socials: [
          { platform: "X", handle: "@SenMullin", url: "https://x.com/SenMullin" },
          { platform: "Facebook", handle: "@SenMullin", url: "https://www.facebook.com/SenMullin/" },
        ],
        note: "verify handle before each post",
      },
    ],
  },
  SC: {
    D: [{ name: "Jim Clyburn", title: "U.S. Rep. (SC-06)", handle: "@Clyburn", profile_url: "https://x.com/Clyburn" }],
    R: [
      { name: "Tim Scott", title: "U.S. Senator", handle: "@SenatorTimScott", profile_url: "https://x.com/SenatorTimScott" },
      { name: "Lindsey Graham", title: "U.S. Senator", handle: "@LindseyGrahamSC", profile_url: "https://x.com/LindseyGrahamSC" },
    ],
  },
  TX: {
    D: [
      {
        name: "Marc Veasey",
        title: "U.S. Rep. (TX-33)",
        handle: "@RepVeasey",
        profile_url: "https://x.com/RepVeasey",
        socials: [
          { platform: "X", handle: "@RepVeasey", url: "https://x.com/RepVeasey" },
          { platform: "Facebook", handle: "@CongressmanMarcVeasey", url: "https://www.facebook.com/CongressmanMarcVeasey/" },
          { platform: "Instagram", handle: "@repveasey", url: "https://www.instagram.com/repveasey/" },
        ],
        note: "Dallas-Fort Worth",
      },
    ],
    R: [
      {
        name: "Beth Van Duyne",
        title: "U.S. Rep. (TX-24)",
        handle: "@RepBethVanDuyne",
        profile_url: "https://x.com/RepBethVanDuyne",
        note: "part of Dallas Co.",
      },
      {
        name: "Ted Cruz",
        title: "U.S. Senator",
        handle: "@SenTedCruz",
        profile_url: "https://x.com/SenTedCruz",
        socials: [
          { platform: "X", handle: "@SenTedCruz", url: "https://x.com/SenTedCruz" },
          { platform: "Facebook", handle: "@SenatorTedCruz", url: "https://www.facebook.com/SenatorTedCruz/" },
          { platform: "Instagram", handle: "@sentedcruz", url: "https://www.instagram.com/sentedcruz/" },
        ],
      },
      {
        name: "John Cornyn",
        title: "U.S. Senator",
        handle: "@JohnCornyn",
        profile_url: "https://x.com/JohnCornyn",
        note: "seated through Jan 2027; re-verify",
      },
    ],
  },
  CA: {
    D: [
      { name: "Alex Padilla", title: "U.S. Senator", handle: "@SenAlexPadilla", profile_url: "https://x.com/SenAlexPadilla" },
      { name: "Adam Schiff", title: "U.S. Senator", handle: "@SenAdamSchiff", profile_url: "https://x.com/SenAdamSchiff" },
      { name: "Ro Khanna", title: "U.S. Rep. (CA-17)", handle: "@RepRoKhanna", profile_url: "https://x.com/RepRoKhanna" },
      { name: "Nancy Pelosi", title: "U.S. Rep. (CA-11)", handle: "@SpeakerPelosi", profile_url: "https://x.com/SpeakerPelosi" },
    ],
    R: [
      { name: "Kevin Kiley", title: "U.S. Rep. (CA-03)", handle: "@RepKiley", profile_url: "https://x.com/RepKiley" },
      { name: "Young Kim", title: "U.S. Rep. (CA-40)", handle: "@RepYoungKim", profile_url: "https://x.com/RepYoungKim" },
      { name: "Ken Calvert", title: "U.S. Rep. (CA-41)", handle: "@KenCalvert", profile_url: "https://x.com/KenCalvert" },
      { name: "Darrell Issa", title: "U.S. Rep. (CA-48)", handle: "@repdarrellissa", profile_url: "https://x.com/repdarrellissa" },
    ],
  },
  CO: {
    D: [
      { name: "Michael Bennet", title: "U.S. Senator", handle: "@SenatorBennet", profile_url: "https://x.com/SenatorBennet" },
      { name: "John Hickenlooper", title: "U.S. Senator", handle: "@SenatorHick", profile_url: "https://x.com/SenatorHick" },
      { name: "Jason Crow", title: "U.S. Rep. (CO-06)", handle: "@RepJasonCrow", profile_url: "https://x.com/RepJasonCrow" },
      { name: "Diana DeGette", title: "U.S. Rep. (CO-01)", handle: "@RepDianaDeGette", profile_url: "https://x.com/RepDianaDeGette" },
    ],
    R: [
      { name: "Jeff Crank", title: "U.S. Rep. (CO-05)", handle: "@RepJeffCrank", profile_url: "https://x.com/RepJeffCrank" },
      { name: "Lauren Boebert", title: "U.S. Rep. (CO-04)", handle: "@RepBoebert", profile_url: "https://x.com/RepBoebert" },
      { name: "Gabe Evans", title: "U.S. Rep. (CO-08)", handle: "@RepGabeEvans", profile_url: "https://x.com/RepGabeEvans" },
    ],
  },
  GA: {
    D: [
      { name: "Jon Ossoff", title: "U.S. Senator", handle: "@ossoff", profile_url: "https://x.com/ossoff" },
      { name: "Raphael Warnock", title: "U.S. Senator", handle: "@SenatorWarnock", profile_url: "https://x.com/SenatorWarnock" },
      { name: "Nikema Williams", title: "U.S. Rep. (GA-05)", handle: "@RepNikema", profile_url: "https://x.com/RepNikema" },
      { name: "Lucy McBath", title: "U.S. Rep. (GA-07)", handle: "@RepLucyMcBath", profile_url: "https://x.com/RepLucyMcBath" },
    ],
    R: [
      { name: "Buddy Carter", title: "U.S. Rep. (GA-01)", handle: "@RepBuddyCarter", profile_url: "https://x.com/RepBuddyCarter" },
      { name: "Brian Jack", title: "U.S. Rep. (GA-03)", handle: "@RepBrianJack", profile_url: "https://x.com/RepBrianJack" },
      { name: "Mike Collins", title: "U.S. Rep. (GA-10)", handle: "@RepMikeCollins", profile_url: "https://x.com/RepMikeCollins" },
      { name: "Rick Allen", title: "U.S. Rep. (GA-12)", handle: "@RepRickAllen", profile_url: "https://x.com/RepRickAllen" },
    ],
  },
  IL: {
    D: [
      { name: "Dick Durbin", title: "U.S. Senator", handle: "@SenatorDurbin", profile_url: "https://x.com/SenatorDurbin" },
      { name: "Tammy Duckworth", title: "U.S. Senator", handle: "@SenDuckworth", profile_url: "https://x.com/SenDuckworth" },
      { name: "Robin Kelly", title: "U.S. Rep. (IL-02)", handle: "@RepRobinKelly", profile_url: "https://x.com/RepRobinKelly" },
      { name: "Brad Schneider", title: "U.S. Rep. (IL-10)", handle: "@RepSchneider", profile_url: "https://x.com/RepSchneider" },
    ],
    R: [
      { name: "Darin LaHood", title: "U.S. Rep. (IL-16)", handle: "@RepLaHood", profile_url: "https://x.com/RepLaHood" },
      { name: "Mary Miller", title: "U.S. Rep. (IL-15)", handle: "@RepMaryMiller", profile_url: "https://x.com/RepMaryMiller" },
      { name: "Mike Bost", title: "U.S. Rep. (IL-12)", handle: "@RepBost", profile_url: "https://x.com/RepBost" },
    ],
  },
  KY: {
    D: [
      { name: "Morgan McGarvey", title: "U.S. Rep. (KY-03)", handle: "@RepMcGarvey", profile_url: "https://x.com/RepMcGarvey", note: "Kentucky's only federal Democrat" },
    ],
    R: [
      { name: "Mitch McConnell", title: "U.S. Senator", handle: "@LeaderMcConnell", profile_url: "https://x.com/LeaderMcConnell" },
      { name: "Rand Paul", title: "U.S. Senator", handle: "@RandPaul", profile_url: "https://x.com/RandPaul" },
      { name: "James Comer", title: "U.S. Rep. (KY-01)", handle: "@RepJamesComer", profile_url: "https://x.com/RepJamesComer" },
      { name: "Andy Barr", title: "U.S. Rep. (KY-06)", handle: "@RepAndyBarr", profile_url: "https://x.com/RepAndyBarr" },
    ],
  },
  LA: {
    D: [
      { name: "Troy Carter", title: "U.S. Rep. (LA-02)", handle: "@RepTroyCarter", profile_url: "https://x.com/RepTroyCarter" },
      { name: "Cleo Fields", title: "U.S. Rep. (LA-06)", handle: "@RepFields", profile_url: "https://x.com/RepFields" },
    ],
    R: [
      { name: "Bill Cassidy", title: "U.S. Senator", handle: "@SenBillCassidy", profile_url: "https://x.com/SenBillCassidy" },
      { name: "John Kennedy", title: "U.S. Senator", handle: "@SenJohnKennedy", profile_url: "https://x.com/SenJohnKennedy" },
      { name: "Steve Scalise", title: "U.S. Rep. (LA-01)", handle: "@SteveScalise", profile_url: "https://x.com/SteveScalise" },
      { name: "Clay Higgins", title: "U.S. Rep. (LA-03)", handle: "@RepClayHiggins", profile_url: "https://x.com/RepClayHiggins" },
    ],
  },
  MN: {
    D: [
      { name: "Amy Klobuchar", title: "U.S. Senator", handle: "@AmyKlobuchar", profile_url: "https://x.com/AmyKlobuchar" },
      { name: "Tina Smith", title: "U.S. Senator", handle: "@SenatorSmith", profile_url: "https://x.com/SenatorSmith" },
      { name: "Angie Craig", title: "U.S. Rep. (MN-02)", handle: "@RepAngieCraig", profile_url: "https://x.com/RepAngieCraig" },
      { name: "Betty McCollum", title: "U.S. Rep. (MN-04)", handle: "@BettyMcCollum04", profile_url: "https://x.com/BettyMcCollum04" },
    ],
    R: [
      { name: "Pete Stauber", title: "U.S. Rep. (MN-08)", handle: "@RepPeteStauber", profile_url: "https://x.com/RepPeteStauber" },
      { name: "Tom Emmer", title: "U.S. Rep. (MN-06)", handle: "@GOPMajorityWhip", profile_url: "https://x.com/GOPMajorityWhip" },
      { name: "Brad Finstad", title: "U.S. Rep. (MN-01)", handle: "@repfinstad", profile_url: "https://x.com/repfinstad" },
    ],
  },
  MO: {
    D: [
      { name: "Emanuel Cleaver", title: "U.S. Rep. (MO-05)", handle: "@repcleaver", profile_url: "https://x.com/repcleaver", note: "Missouri's longest-serving federal Democrat" },
      { name: "Wesley Bell", title: "U.S. Rep. (MO-01)", handle: "@RepWesleyBellMO", profile_url: "https://x.com/RepWesleyBellMO" },
    ],
    R: [
      { name: "Josh Hawley", title: "U.S. Senator", handle: "@SenHawley", profile_url: "https://x.com/SenHawley" },
      { name: "Eric Schmitt", title: "U.S. Senator", handle: "@SenEricSchmitt", profile_url: "https://x.com/SenEricSchmitt" },
      { name: "Ann Wagner", title: "U.S. Rep. (MO-02)", handle: "@RepAnnWagner", profile_url: "https://x.com/RepAnnWagner" },
      { name: "Mark Alford", title: "U.S. Rep. (MO-04)", handle: "@RepMarkAlford", profile_url: "https://x.com/RepMarkAlford" },
    ],
  },
  MS: {
    D: [
      { name: "Bennie Thompson", title: "U.S. Rep. (MS-02)", handle: "@BennieGThompson", profile_url: "https://x.com/BennieGThompson", note: "Mississippi's only federal Democrat" },
    ],
    R: [
      { name: "Roger Wicker", title: "U.S. Senator", handle: "@SenatorWicker", profile_url: "https://x.com/SenatorWicker" },
      { name: "Cindy Hyde-Smith", title: "U.S. Senator", handle: "@SenHydeSmith", profile_url: "https://x.com/SenHydeSmith" },
      { name: "Trent Kelly", title: "U.S. Rep. (MS-01)", handle: "@RepTrentKelly", profile_url: "https://x.com/RepTrentKelly" },
      { name: "Michael Guest", title: "U.S. Rep. (MS-03)", handle: "@RepMichaelGuest", profile_url: "https://x.com/RepMichaelGuest" },
    ],
  },
  MT: {
    D: [
      {
        name: "Kendall Van Dyk",
        title: "MT House Democratic Leader",
        profile_url: "https://www.facebook.com/kendallvandyk/",
        socials: [
          { platform: "Facebook", handle: "@kendallvandyk", url: "https://www.facebook.com/kendallvandyk/" },
          { platform: "Official", url: "https://leg.mt.gov/legislator-information/legislator-roster/legislator-detail/7713" },
        ],
        note: "no federal D in MT",
      },
    ],
    R: [
      { name: "Steve Daines", title: "U.S. Senator", handle: "@SteveDaines", profile_url: "https://x.com/SteveDaines" },
      { name: "Ryan Zinke", title: "U.S. Rep. (MT-01)", handle: "@RepRyanZinke", profile_url: "https://x.com/RepRyanZinke" },
      { name: "Troy Downing", title: "U.S. Rep. (MT-02)", handle: "@RepTroyDowning", profile_url: "https://x.com/RepTroyDowning" },
    ],
  },
  OR: {
    D: [
      { name: "Ron Wyden", title: "U.S. Senator", handle: "@RonWyden", profile_url: "https://x.com/RonWyden" },
      { name: "Jeff Merkley", title: "U.S. Senator", handle: "@SenJeffMerkley", profile_url: "https://x.com/SenJeffMerkley" },
      { name: "Suzanne Bonamici", title: "U.S. Rep. (OR-01)", handle: "@RepBonamici", profile_url: "https://x.com/RepBonamici" },
      { name: "Janelle Bynum", title: "U.S. Rep. (OR-05)", handle: "@RepBynum", profile_url: "https://x.com/RepBynum" },
    ],
    R: [
      { name: "Cliff Bentz", title: "U.S. Rep. (OR-02)", handle: "@RepBentz", profile_url: "https://x.com/RepBentz", note: "Oregon's only federal Republican" },
    ],
  },
  PA: {
    D: [
      { name: "John Fetterman", title: "U.S. Senator", handle: "@SenFetterman", profile_url: "https://x.com/SenFetterman" },
      { name: "Brendan Boyle", title: "U.S. Rep. (PA-02)", handle: "@CongBoyle", profile_url: "https://x.com/CongBoyle" },
      { name: "Madeleine Dean", title: "U.S. Rep. (PA-04)", handle: "@RepDean", profile_url: "https://x.com/RepDean" },
    ],
    R: [
      { name: "Dave McCormick", title: "U.S. Senator", handle: "@SenMcCormick", profile_url: "https://x.com/SenMcCormick" },
      { name: "Brian Fitzpatrick", title: "U.S. Rep. (PA-01)", handle: "@RepBrianFitz", profile_url: "https://x.com/RepBrianFitz" },
      { name: "John Joyce", title: "U.S. Rep. (PA-13)", handle: "@RepJohnJoyce", profile_url: "https://x.com/RepJohnJoyce" },
    ],
  },
  RI: {
    D: [
      { name: "Jack Reed", title: "U.S. Senator", handle: "@SenJackReed", profile_url: "https://x.com/SenJackReed" },
      { name: "Sheldon Whitehouse", title: "U.S. Senator", handle: "@SenWhitehouse", profile_url: "https://x.com/SenWhitehouse" },
      { name: "Gabe Amo", title: "U.S. Rep. (RI-01)", handle: "@RepGabeAmo", profile_url: "https://x.com/RepGabeAmo" },
      { name: "Seth Magaziner", title: "U.S. Rep. (RI-02)", handle: "@Rep_Magaziner", profile_url: "https://x.com/Rep_Magaziner" },
    ],
    R: [
      {
        name: "Vincent Candelora",
        title: "RI House Minority Leader",
        profile_url: "https://www.facebook.com/RepCandelora/",
        socials: [
          { platform: "Facebook", handle: "@RepCandelora", url: "https://www.facebook.com/RepCandelora/" },
          { platform: "Official", url: "https://www.rilegislature.gov/representatives/candelora/Pages/Biography.aspx" },
        ],
        note: "no federal R in RI",
      },
    ],
  },
  TN: {
    D: [
      { name: "Steve Cohen", title: "U.S. Rep. (TN-09)", handle: "@RepCohen", profile_url: "https://x.com/RepCohen", note: "Tennessee's only federal Democrat" },
    ],
    R: [
      { name: "Marsha Blackburn", title: "U.S. Senator", handle: "@MarshaBlackburn", profile_url: "https://x.com/MarshaBlackburn" },
      { name: "Bill Hagerty", title: "U.S. Senator", handle: "@SenatorHagerty", profile_url: "https://x.com/SenatorHagerty" },
      { name: "Tim Burchett", title: "U.S. Rep. (TN-02)", handle: "@RepTimBurchett", profile_url: "https://x.com/RepTimBurchett" },
      { name: "Diana Harshbarger", title: "U.S. Rep. (TN-01)", handle: "@RepHarshbarger", profile_url: "https://x.com/RepHarshbarger" },
    ],
  },
  UT: {
    D: [
      {
        name: "Angela Romero",
        title: "UT Senate Democratic Leader",
        profile_url: "https://www.facebook.com/SenAngelaRomero/",
        socials: [
          { platform: "Facebook", handle: "@SenAngelaRomero", url: "https://www.facebook.com/SenAngelaRomero/" },
          { platform: "Instagram", handle: "@senangelaromero", url: "https://www.instagram.com/senangelaromero/" },
          { platform: "Official", url: "https://le.utah.gov/senate/curriculum-and-member-information/romero-angela/" },
        ],
        note: "no federal D in UT",
      },
    ],
    R: [
      { name: "Mike Lee", title: "U.S. Senator", handle: "@SenMikeLee", profile_url: "https://x.com/SenMikeLee" },
      { name: "John Curtis", title: "U.S. Senator", handle: "@SenatorCurtis", profile_url: "https://x.com/SenatorCurtis" },
      { name: "Blake Moore", title: "U.S. Rep. (UT-01)", handle: "@RepBlakeMoore", profile_url: "https://x.com/RepBlakeMoore" },
      { name: "Burgess Owens", title: "U.S. Rep. (UT-04)", handle: "@RepBurgessOwens", profile_url: "https://x.com/RepBurgessOwens" },
    ],
  },
  WA: {
    D: [
      { name: "Patty Murray", title: "U.S. Senator", handle: "@PattyMurray", profile_url: "https://x.com/PattyMurray" },
      { name: "Maria Cantwell", title: "U.S. Senator", handle: "@SenatorCantwell", profile_url: "https://x.com/SenatorCantwell" },
      { name: "Suzan DelBene", title: "U.S. Rep. (WA-01)", handle: "@RepDelBene", profile_url: "https://x.com/RepDelBene" },
      { name: "Pramila Jayapal", title: "U.S. Rep. (WA-07)", handle: "@RepJayapal", profile_url: "https://x.com/RepJayapal" },
    ],
    R: [
      { name: "Dan Newhouse", title: "U.S. Rep. (WA-04)", handle: "@RepNewhouse", profile_url: "https://x.com/RepNewhouse" },
      { name: "Michael Baumgartner", title: "U.S. Rep. (WA-05)", handle: "@RepBaumgartner", profile_url: "https://x.com/RepBaumgartner" },
      {
        name: "Drew Stokesbary",
        title: "WA House Republican Leader",
        profile_url: "https://leg.wa.gov/legislators/member/drew-stokesbary",
        socials: [{ platform: "Official", url: "https://leg.wa.gov/legislators/member/drew-stokesbary" }],
        note: "state leader; only 2 federal Rs in WA",
      },
    ],
  },
  WV: {
    D: [
      {
        name: "Stephen Skinner",
        title: "WV Senate Democratic Leader",
        profile_url: "https://www.facebook.com/StephenSkinnerWV/",
        socials: [
          { platform: "Facebook", handle: "@StephenSkinnerWV", url: "https://www.facebook.com/StephenSkinnerWV/" },
          { platform: "Official", url: "https://www.wvlegislature.gov/Senate1/lawmaker.cfm?member=Senator%20Skinner" },
        ],
        note: "no federal D in WV",
      },
    ],
    R: [
      { name: "Shelley Moore Capito", title: "U.S. Senator", handle: "@SenCapito", profile_url: "https://x.com/SenCapito" },
      { name: "Jim Justice", title: "U.S. Senator", handle: "@Sen_JimJustice", profile_url: "https://x.com/Sen_JimJustice" },
      { name: "Carol Miller", title: "U.S. Rep. (WV-01)", handle: "@RepCarolMiller", profile_url: "https://x.com/RepCarolMiller" },
      { name: "Riley Moore", title: "U.S. Rep. (WV-02)", handle: "@RepRileyMoore", profile_url: "https://x.com/RepRileyMoore" },
    ],
  },
};

// Verified county → state legislator pairs from the playbook.
type StateLegislatorPair = { state: string; senate: StateLegislatorPick; house: StateLegislatorPick; note?: string };

const COUNTY_STATE_LEGISLATORS: Record<
  string,
  StateLegislatorPair | StateLegislatorPair[]
> = {
  "Lenoir Co., NC": {
    state: "NC",
    senate: { party: "R", name: "Bob Brinson", title: "NC Senate (SD-3)", chamber: "senate", handle: "@bobbrinsonjr", profile_url: "https://www.instagram.com/bobbrinsonjr", socials: [{ platform: "Instagram", handle: "@bobbrinsonjr", url: "https://www.instagram.com/bobbrinsonjr" }] },
    house: { party: "R", name: "Chris Humphrey", title: "NC House (HD-12)", chamber: "house", handle: "@RepHumphrey", profile_url: "https://x.com/RepHumphrey", socials: [{ platform: "X", handle: "@RepHumphrey", url: "https://x.com/RepHumphrey" }] },
  },
  "Beaufort Co., NC": {
    state: "NC",
    senate: { party: "R", name: "Bob Brinson", title: "NC Senate (SD-3)", chamber: "senate", handle: "@bobbrinsonjr", profile_url: "https://www.instagram.com/bobbrinsonjr", socials: [{ platform: "Instagram", handle: "@bobbrinsonjr", url: "https://www.instagram.com/bobbrinsonjr" }] },
    house: { party: "R", name: "Keith Kidwell", title: "NC House (HD-79)", chamber: "house", handle: "@RepKidwell", profile_url: "https://x.com/RepKidwell", socials: [{ platform: "X", handle: "@RepKidwell", url: "https://x.com/RepKidwell" }] },
  },
  "Johnson Co., KS": {
    state: "KS",
    senate: {
      party: "R",
      name: "Adam Thomas",
      title: "KS Senate (SD-23)",
      chamber: "senate",
      profile_url: "https://www.facebook.com/adamthomasforkansas/",
      socials: [
        { platform: "Facebook", handle: "@adamthomasforkansas", url: "https://www.facebook.com/adamthomasforkansas/" },
        { platform: "Official", url: "https://www.kslegislature.gov/b2025_26/legislators/sen_thomas_adam_1/" },
      ],
      note: "central Olathe",
    },
    house: {
      party: "R",
      name: "Lauren Bohi",
      title: "KS House (HD-15)",
      chamber: "house",
      handle: "@LaurenBohiKS",
      profile_url: "https://x.com/LaurenBohiKS",
      socials: [
        { platform: "X", handle: "@LaurenBohiKS", url: "https://x.com/LaurenBohiKS" },
        { platform: "Official", url: "https://www.kslegislature.gov/b2025_26/legislators/rep_bohi_lauren_1/" },
      ],
      note: "central Olathe",
    },
  },
  "Miami Co., KS": {
    state: "KS",
    senate: {
      party: "R",
      name: "Doug Shane",
      title: "KS Senate (SD-37)",
      chamber: "senate",
      profile_url: "https://www.kslegislature.gov/b2025_26/legislators/sen_shane_doug_1/",
      socials: [{ platform: "Official", url: "https://www.kslegislature.gov/b2025_26/legislators/sen_shane_doug_1/" }],
    },
    house: {
      party: "R",
      name: "Samantha Poetter Parshall",
      title: "KS House (HD-6)",
      chamber: "house",
      handle: "@SamanthaPoetter",
      profile_url: "https://x.com/SamanthaPoetter",
      socials: [
        { platform: "X", handle: "@SamanthaPoetter", url: "https://x.com/SamanthaPoetter" },
        { platform: "Official", url: "https://www.kslegislature.gov/b2025_26/legislators/rep_poetter_parshall_samantha_1/" },
      ],
    },
  },
  "Cowley Co., KS": {
    state: "KS",
    senate: { party: "R", name: "Larry Alley", title: "KS Senate (SD-32)", chamber: "senate" },
    house: { party: "R", name: "Andy Winn", title: "KS House (HD-79)", chamber: "house", note: "verify current rep" },
  },
  "Oakland Co., MI": {
    state: "MI",
    senate: { party: "D", name: "Jeremy Moss", title: "MI Senate (SD-7)", chamber: "senate", handle: "@JeremyMossMI", profile_url: "https://x.com/JeremyMossMI", socials: [{ platform: "X", handle: "@JeremyMossMI", url: "https://x.com/JeremyMossMI" }] },
    house: { party: "D", name: "Brenda Carter", title: "MI House (HD-53)", chamber: "house", note: "Pontiac/Oakland HD-53" },
  },
  "Montcalm Co., MI": {
    state: "MI",
    senate: { party: "R", name: "Rick Outman", title: "MI Senate (SD-33)", chamber: "senate", handle: "@rickoutman", profile_url: "https://x.com/rickoutman", socials: [{ platform: "X", handle: "@rickoutman", url: "https://x.com/rickoutman" }] },
    house: { party: "R", name: "Pat Outman", title: "MI House (HD-91)", chamber: "house" },
  },
  "Wayne Co., MI": [
    {
      state: "MI",
      senate: {
        party: "D",
        name: "Stephanie Chang",
        title: "MI Senate (SD-3)",
        chamber: "senate",
        handle: "@stephaniechangMI",
        profile_url: "https://www.facebook.com/stephaniechangMI/",
        socials: [
          { platform: "Facebook", handle: "@stephaniechangMI", url: "https://www.facebook.com/stephaniechangMI/" },
          { platform: "Instagram", handle: "@stephanielilychang", url: "https://www.instagram.com/stephanielilychang/" },
          { platform: "Official", url: "https://senatedems.com/chang/" },
        ],
        note: "Detroit / Wayne County rotation pick",
      },
      house: {
        party: "D",
        name: "Stephanie A. Young",
        title: "MI House (HD-16)",
        chamber: "house",
        handle: "@RepStephanieYoung",
        profile_url: "https://www.facebook.com/RepStephanieYoung/",
        socials: [
          { platform: "Facebook", handle: "@RepStephanieYoung", url: "https://www.facebook.com/RepStephanieYoung/" },
          { platform: "X", handle: "@StateRepSteph", url: "https://x.com/StateRepSteph" },
          { platform: "Instagram", handle: "@staterepyoung", url: "https://www.instagram.com/staterepyoung/" },
          { platform: "Official", url: "https://housedems.com/stephanie-young/" },
        ],
        note: "Detroit / Wayne County rotation pick",
      },
    },
    {
      state: "MI",
      senate: {
        party: "D",
        name: "Darrin Camilleri",
        title: "MI Senate (SD-4)",
        chamber: "senate",
        handle: "@darrincamilleri",
        profile_url: "https://x.com/darrincamilleri",
        socials: [
          { platform: "X", handle: "@darrincamilleri", url: "https://x.com/darrincamilleri" },
          { platform: "Facebook", handle: "@SenDarrinCamilleri", url: "https://www.facebook.com/SenDarrinCamilleri/" },
          { platform: "Instagram", handle: "@senatorcamilleri", url: "https://www.instagram.com/senatorcamilleri/" },
          { platform: "Official", url: "https://senatedems.com/camilleri/" },
        ],
        note: "Downriver / western Wayne rotation pick",
      },
      house: {
        party: "R",
        name: "Jamie Thompson",
        title: "MI House (HD-28)",
        chamber: "house",
        handle: "@StateRepThompson",
        profile_url: "https://www.facebook.com/StateRepThompson/",
        socials: [
          { platform: "Facebook", handle: "@StateRepThompson", url: "https://www.facebook.com/StateRepThompson/" },
          { platform: "Official", url: "https://gophouse.org/member/RepJamieThompson/about" },
        ],
        note: "Downriver Wayne rotation pick",
      },
    },
  ],
  "Clark Co., NV": {
    state: "NV",
    senate: { party: "D", name: "Rochelle Nguyen", title: "NV Senate (SD-3)", chamber: "senate", handle: "@rochellefornevada", profile_url: "https://www.facebook.com/rochellefornevada", socials: [{ platform: "Facebook", handle: "@rochellefornevada", url: "https://www.facebook.com/rochellefornevada" }] },
    house: { party: "D", name: "Selena Torres-Fossett", title: "NV Assembly (AD-3)", chamber: "house", handle: "@SelenaTorresNV", profile_url: "https://x.com/SelenaTorresNV", socials: [{ platform: "X", handle: "@SelenaTorresNV", url: "https://x.com/SelenaTorresNV" }, { platform: "Facebook", handle: "@SelenaTorresNV", url: "https://www.facebook.com/SelenaTorresNV" }, { platform: "Instagram", handle: "@selenatorresnv", url: "https://www.instagram.com/selenatorresnv/" }] },
  },
  "Dallas Co., TX": {
    state: "TX",
    senate: { party: "D", name: "Royce West", title: "TX Senate (SD-23)", chamber: "senate", handle: "@SenRoyceWest", profile_url: "https://x.com/SenRoyceWest", socials: [{ platform: "X", handle: "@SenRoyceWest", url: "https://x.com/SenRoyceWest" }] },
    house: { party: "D", name: "Rafael Anchía", title: "TX House (HD-103)", chamber: "house", handle: "@RafaelAnchia", profile_url: "https://x.com/RafaelAnchia", socials: [{ platform: "X", handle: "@RafaelAnchia", url: "https://x.com/RafaelAnchia" }] },
  },
  "Collin Co., TX": {
    state: "TX",
    senate: { party: "R", name: "Angela Paxton", title: "TX Senate (SD-8)", chamber: "senate", handle: "@AngelaPaxtonTX", profile_url: "https://x.com/AngelaPaxtonTX", socials: [{ platform: "X", handle: "@AngelaPaxtonTX", url: "https://x.com/AngelaPaxtonTX" }] },
    house: { party: "R", name: "Jeff Leach", title: "TX House (HD-67)", chamber: "house", handle: "@leachfortexas", profile_url: "https://x.com/leachfortexas", socials: [{ platform: "X", handle: "@leachfortexas", url: "https://x.com/leachfortexas" }] },
  },
  "Denton Co., TX": {
    state: "TX",
    senate: { party: "R", name: "Brent Hagenbuch", title: "TX Senate (SD-30)", chamber: "senate" },
    house: { party: "R", name: "Andy Hopper", title: "TX House (HD-64)", chamber: "house", handle: "@AndyHopperTX", profile_url: "https://x.com/AndyHopperTX", socials: [{ platform: "X", handle: "@AndyHopperTX", url: "https://x.com/AndyHopperTX" }] },
  },
  "Baldwin Co., AL": {
    state: "AL",
    senate: { party: "R", name: "Chris Elliott", title: "AL Senate (SD-32)", chamber: "senate", handle: "@SenatorElliott", profile_url: "https://x.com/SenatorElliott", socials: [{ platform: "X", handle: "@SenatorElliott", url: "https://x.com/SenatorElliott" }] },
    house: { party: "R", name: "Matt Simpson", title: "AL House (HD-96)", chamber: "house", handle: "@RepMattSimpson", profile_url: "https://www.facebook.com/RepMattSimpson", socials: [{ platform: "Facebook", handle: "@RepMattSimpson", url: "https://www.facebook.com/RepMattSimpson" }] },
  },
  "Elmore Co., AL": {
    state: "AL",
    senate: { party: "R", name: "Clyde Chambliss", title: "AL Senate (SD-30)", chamber: "senate", handle: "@Clyde_Chambliss", profile_url: "https://x.com/Clyde_Chambliss", socials: [{ platform: "X", handle: "@Clyde_Chambliss", url: "https://x.com/Clyde_Chambliss" }] },
    house: { party: "R", name: "Troy Stubbs", title: "AL House (HD-31)", chamber: "house" },
  },
  "Chilton Co., AL": {
    state: "AL",
    senate: { party: "R", name: "Clyde Chambliss", title: "AL Senate (SD-30)", chamber: "senate", handle: "@Clyde_Chambliss", profile_url: "https://x.com/Clyde_Chambliss", socials: [{ platform: "X", handle: "@Clyde_Chambliss", url: "https://x.com/Clyde_Chambliss" }] },
    house: { party: "R", name: "Russell Bedsole", title: "AL House (HD-49)", chamber: "house" },
  },
  "Autauga Co., AL": {
    state: "AL",
    senate: { party: "R", name: "Clyde Chambliss", title: "AL Senate (SD-30)", chamber: "senate", handle: "@Clyde_Chambliss", profile_url: "https://x.com/Clyde_Chambliss", socials: [{ platform: "X", handle: "@Clyde_Chambliss", url: "https://x.com/Clyde_Chambliss" }] },
    house: { party: "R", name: "Jerry Starnes", title: "AL House (HD-88)", chamber: "house", profile_url: "https://www.facebook.com/jerrystarneshd88", socials: [{ platform: "Facebook", handle: "@jerrystarneshd88", url: "https://www.facebook.com/jerrystarneshd88" }] },
  },
  "Sebastian Co., AR": {
    state: "AR",
    senate: { party: "R", name: "Justin Boyd", title: "AR Senate (SD-27)", chamber: "senate" },
    house: { party: "R", name: "Cindy Crawford", title: "AR House (HD-51)", chamber: "house" },
  },
  "Hartford Co., CT": {
    state: "CT",
    senate: { party: "D", name: "John Fonfara", title: "CT Senate (SD-1)", chamber: "senate" },
    house: { party: "D", name: "Minnie Gonzalez", title: "CT House (HD-3)", chamber: "house" },
  },
  "Fairfield Co., CT": {
    state: "CT",
    senate: { party: "D", name: "Patricia Billie Miller", title: "CT Senate (SD-27)", chamber: "senate" },
    house: { party: "D", name: "Antonio Felipe", title: "CT House (HD-130)", chamber: "house" },
  },
  "Volusia Co., FL": {
    state: "FL",
    senate: { party: "R", name: "Tom Wright", title: "FL Senate (SD-8)", chamber: "senate", handle: "@SenTomWright", profile_url: "https://x.com/SenTomWright", socials: [{ platform: "X", handle: "@SenTomWright", url: "https://x.com/SenTomWright" }] },
    house: { party: "R", name: "Webster Barnaby", title: "FL House (HD-29)", chamber: "house", handle: "@websterbarnaby", profile_url: "https://x.com/websterbarnaby", socials: [{ platform: "X", handle: "@websterbarnaby", url: "https://x.com/websterbarnaby" }] },
  },
  "Broward Co., FL": {
    state: "FL",
    senate: { party: "D", name: "Rosalind Osgood", title: "FL Senate (SD-32)", chamber: "senate", handle: "@ReverendRos", profile_url: "https://x.com/ReverendRos", socials: [{ platform: "X", handle: "@ReverendRos", url: "https://x.com/ReverendRos" }, { platform: "Instagram", handle: "@senatorosgood", url: "https://www.instagram.com/senatorosgood/" }, { platform: "Facebook", handle: "@senatorosgood", url: "https://www.facebook.com/senatorosgood" }] },
    house: { party: "D", name: "Daryl Campbell", title: "FL House (HD-99)", chamber: "house", handle: "@RepCampbell_FL", profile_url: "https://x.com/RepCampbell_FL", socials: [{ platform: "X", handle: "@RepCampbell_FL", url: "https://x.com/RepCampbell_FL" }, { platform: "Instagram", handle: "@repcampbell", url: "https://www.instagram.com/repcampbell/" }] },
  },
  "Wapello Co., IA": {
    state: "IA",
    senate: {
      party: "D",
      name: "Janice Weiner",
      title: "IA Senate (SD-36)",
      chamber: "senate",
      handle: "@JaniceWeinerIA",
      profile_url: "https://x.com/JaniceWeinerIA",
      socials: [
        { platform: "X", handle: "@JaniceWeinerIA", url: "https://x.com/JaniceWeinerIA" },
        { platform: "Official", url: "https://www.legis.iowa.gov/legislators/legislator?ga=91&personID=30688" },
      ],
    },
    house: {
      party: "D",
      name: "Brian Meyer",
      title: "IA House (HD-29)",
      chamber: "house",
      profile_url: "https://www.legis.iowa.gov/legislators/legislator?ga=91&personID=30652",
      socials: [{ platform: "Official", url: "https://www.legis.iowa.gov/legislators/legislator?ga=91&personID=30652" }],
    },
  },
  "Elkhart Co., IN": {
    state: "IN",
    senate: { party: "R", name: "Ryan Mishler", title: "IN Senate (SD-9)", chamber: "senate" },
    house: { party: "R", name: "Doug Miller", title: "IN House (HD-48)", chamber: "house" },
  },
  "Monroe Co., NY": {
    state: "NY",
    senate: { party: "D", name: "Jeremy Cooney", title: "NY Senate (SD-56)", chamber: "senate" },
    house: { party: "D", name: "Sarah Clark", title: "NY Assembly (AD-136)", chamber: "house" },
  },
  "Richland Co., OH": {
    state: "OH",
    senate: {
      party: "R",
      name: "Mark Romanchuk",
      title: "OH Senate (SD-22)",
      chamber: "senate",
      profile_url: "https://www.ohiosenate.gov/members/mark-romanchuk",
      socials: [{ platform: "Official", url: "https://www.ohiosenate.gov/members/mark-romanchuk" }],
    },
    house: {
      party: "R",
      name: "Marilyn John",
      title: "OH House (HD-76)",
      chamber: "house",
      profile_url: "https://www.ohiohouse.gov/members/marilyn-john",
      socials: [{ platform: "Official", url: "https://www.ohiohouse.gov/members/marilyn-john" }],
    },
  },
  "Hancock Co., OH": {
    state: "OH",
    senate: { party: "R", name: "Robert McColley", title: "OH Senate (SD-1)", chamber: "senate" },
    house: { party: "R", name: "Jon Cross", title: "OH House (HD-83)", chamber: "house" },
  },
  "Marion Co., OH": {
    state: "OH",
    senate: { party: "R", name: "Bill Reineke", title: "OH Senate (SD-26)", chamber: "senate" },
    house: { party: "R", name: "Beth Lear", title: "OH House (HD-72)", chamber: "house" },
  },
  "Pottawatomie Co., OK": {
    state: "OK",
    senate: { party: "R", name: "Shane Jett", title: "OK Senate (SD-17)", chamber: "senate" },
    house: { party: "R", name: "Dell Kerbs", title: "OK House (HD-26)", chamber: "house" },
  },
  "Tulsa Co., OK": {
    state: "OK",
    senate: { party: "D", name: "Regina Goodwin", title: "OK Senate (SD-11)", chamber: "senate", handle: "@reginatgoodwin", profile_url: "https://x.com/reginatgoodwin", socials: [{ platform: "X", handle: "@reginatgoodwin", url: "https://x.com/reginatgoodwin" }] },
    house: { party: "D", name: "Ron Stewart", title: "OK House (HD-73)", chamber: "house" },
  },
  "Oklahoma Co., OK": [
    {
      state: "OK",
      senate: {
        party: "D",
        name: "Julia Kirt",
        title: "OK Senate (SD-30)",
        chamber: "senate",
        handle: "@JuliaKirt",
        profile_url: "https://x.com/JuliaKirt",
        socials: [
          { platform: "X", handle: "@JuliaKirt", url: "https://x.com/JuliaKirt" },
          { platform: "Instagram", handle: "@juliakirt", url: "https://www.instagram.com/juliakirt/" },
          { platform: "Facebook", handle: "@kirt4ok", url: "https://www.facebook.com/kirt4ok/" },
          { platform: "Official", url: "https://oksenate.gov/senators/julia-kirt" },
        ],
        note: "Oklahoma County / OKC-area rotation pick",
      },
      house: {
        party: "D",
        name: "Ellen Pogemiller",
        title: "OK House (HD-88)",
        chamber: "house",
        handle: "@epogeokc",
        profile_url: "https://x.com/epogeokc",
        socials: [
          { platform: "X", handle: "@epogeokc", url: "https://x.com/epogeokc" },
          { platform: "Instagram", handle: "@ecpoge", url: "https://www.instagram.com/ecpoge/" },
          { platform: "Facebook", handle: "@ellenforok", url: "https://www.facebook.com/ellenforok/" },
          { platform: "Official", url: "https://www.okhouse.gov/representatives/ellen-pogemiller" },
        ],
        note: "Oklahoma County / OKC-area rotation pick",
      },
    },
    {
      state: "OK",
      senate: {
        party: "D",
        name: "Carri Hicks",
        title: "OK Senate (SD-40)",
        chamber: "senate",
        handle: "@hicks4ok",
        profile_url: "https://www.instagram.com/hicks4ok/",
        socials: [
          { platform: "Instagram", handle: "@hicks4ok", url: "https://www.instagram.com/hicks4ok/" },
          { platform: "Facebook", handle: "@senatorcarrihicks", url: "https://www.facebook.com/senatorcarrihicks/" },
          { platform: "Official", url: "https://oksenate.gov/senators/carri-hicks" },
          { platform: "Campaign", url: "https://www.carrihicks.com/" },
        ],
        note: "Oklahoma County / OKC-area rotation pick",
      },
      house: {
        party: "D",
        name: "Cyndi Munson",
        title: "OK House (HD-85)",
        chamber: "house",
        handle: "@CyndiMunsonOK",
        profile_url: "https://www.facebook.com/CyndiMunsonOK/",
        socials: [
          { platform: "Facebook", handle: "@CyndiMunsonOK", url: "https://www.facebook.com/CyndiMunsonOK/" },
          { platform: "Official", url: "https://www.okhouse.gov/representatives/cyndi-munson" },
        ],
        note: "Oklahoma County / OKC-area rotation pick",
      },
    },
  ],
  "Logan Co., OK": {
    state: "OK",
    senate: { party: "R", name: "Chuck Hall", title: "OK Senate (SD-20)", chamber: "senate" },
    house: { party: "R", name: "Collin Duel", title: "OK House (HD-31)", chamber: "house", note: "shares surname with Judge Louis Duel — flag before tagging" },
  },
  "Scotts Bluff Co., NE": {
    state: "NE",
    senate: {
      party: "NP",
      name: "Brian Hardin",
      title: "NE Legislature (LD-48)",
      chamber: "senate",
      profile_url: "https://nebraskalegislature.gov/senators/legislator?District=48",
      socials: [{ platform: "Official", url: "https://nebraskalegislature.gov/senators/legislator?District=48" }],
    },
    house: {
      party: "NP",
      name: "Nebraska unicameral",
      title: "Single-chamber legislature",
      chamber: "house",
      note: "no separate house seat",
    },
  },
  "Fulton Co., GA": {
    state: "GA",
    senate: {
      party: "D",
      name: "Elena Parent",
      title: "GA Senate (SD-42)",
      chamber: "senate",
      handle: "@parentelena",
      profile_url: "https://x.com/parentelena",
      socials: [
        { platform: "X", handle: "@parentelena", url: "https://x.com/parentelena" },
        { platform: "Official", url: "https://www.legis.ga.gov/members/senate/499" },
      ],
    },
    house: {
      party: "D",
      name: "Shea Roberts",
      title: "GA House (HD-52)",
      chamber: "house",
      profile_url: "https://www.legis.ga.gov/members/house/5033",
      socials: [{ platform: "Official", url: "https://www.legis.ga.gov/members/house/5033" }],
    },
  },
  "Cobb Co., GA": {
    state: "GA",
    senate: {
      party: "R",
      name: "Jason Anavitarte",
      title: "GA Senate (SD-31)",
      chamber: "senate",
      handle: "@JasonAnavitarte",
      profile_url: "https://x.com/JasonAnavitarte",
      socials: [
        { platform: "X", handle: "@JasonAnavitarte", url: "https://x.com/JasonAnavitarte" },
        { platform: "Official", url: "https://www.legis.ga.gov/members/senate/4990" },
      ],
    },
    house: {
      party: "R",
      name: "Sharon Cooper",
      title: "GA House (HD-43)",
      chamber: "house",
      profile_url: "https://www.legis.ga.gov/members/house/123",
      socials: [{ platform: "Official", url: "https://www.legis.ga.gov/members/house/123" }],
    },
  },
  "Cherokee Co., GA": {
    state: "GA",
    senate: {
      party: "R",
      name: "Brandon Beach",
      title: "GA Senate (SD-34)",
      chamber: "senate",
      handle: "@BrandonBeachGA",
      profile_url: "https://x.com/BrandonBeachGA",
      socials: [
        { platform: "X", handle: "@BrandonBeachGA", url: "https://x.com/BrandonBeachGA" },
        { platform: "Official", url: "https://www.legis.ga.gov/members/senate/750" },
      ],
    },
    house: {
      party: "R",
      name: "Josh Bonner",
      title: "GA House (HD-72)",
      chamber: "house",
      profile_url: "https://www.legis.ga.gov/members/house/4991",
      socials: [{ platform: "Official", url: "https://www.legis.ga.gov/members/house/4991" }],
    },
  },
  "Hall Co., GA": {
    state: "GA",
    senate: {
      party: "R",
      name: "Butch Miller",
      title: "GA Senate (SD-49)",
      chamber: "senate",
      profile_url: "https://www.legis.ga.gov/members/senate/774",
      socials: [{ platform: "Official", url: "https://www.legis.ga.gov/members/senate/774" }],
    },
    house: {
      party: "R",
      name: "Matt Dubnik",
      title: "GA House (HD-29)",
      chamber: "house",
      profile_url: "https://www.legis.ga.gov/members/house/4992",
      socials: [{ platform: "Official", url: "https://www.legis.ga.gov/members/house/4992" }],
    },
  },
  "Wake Co., NC": {
    state: "NC",
    senate: {
      party: "D",
      name: "Sydney Batch",
      title: "NC Senate (SD-17)",
      chamber: "senate",
      handle: "@SydneyBatchNC",
      profile_url: "https://x.com/SydneyBatchNC",
      socials: [{ platform: "X", handle: "@SydneyBatchNC", url: "https://x.com/SydneyBatchNC" }],
    },
    house: {
      party: "D",
      name: "Julie von Haefen",
      title: "NC House (HD-36)",
      chamber: "house",
      handle: "@JulieVonHaefen",
      profile_url: "https://x.com/JulieVonHaefen",
      socials: [{ platform: "X", handle: "@JulieVonHaefen", url: "https://x.com/JulieVonHaefen" }],
    },
  },
  "Cuyahoga Co., OH": {
    state: "OH",
    senate: {
      party: "D",
      name: "Sandra Williams",
      title: "OH Senate (SD-21)",
      chamber: "senate",
      profile_url: "https://www.ohiosenate.gov/members/sandra-williams",
      socials: [{ platform: "Official", url: "https://www.ohiosenate.gov/members/sandra-williams" }],
    },
    house: {
      party: "D",
      name: "Juanita Brent",
      title: "OH House (HD-12)",
      chamber: "house",
      handle: "@RepJuanitaBrent",
      profile_url: "https://x.com/RepJuanitaBrent",
      socials: [{ platform: "X", handle: "@RepJuanitaBrent", url: "https://x.com/RepJuanitaBrent" }],
    },
  },
  "Sedgwick Co., KS": {
    state: "KS",
    senate: {
      party: "R",
      name: "Ty Masterson",
      title: "KS Senate (SD-16)",
      chamber: "senate",
      handle: "@TyMastersonKS",
      profile_url: "https://x.com/TyMastersonKS",
      socials: [
        { platform: "X", handle: "@TyMastersonKS", url: "https://x.com/TyMastersonKS" },
        { platform: "Official", url: "https://www.kslegislature.gov/b2025_26/legislators/sen_masterson_ty_1/" },
      ],
    },
    house: {
      party: "R",
      name: "Nick Hoheisel",
      title: "KS House (HD-97)",
      chamber: "house",
      profile_url: "https://www.kslegislature.gov/b2025_26/legislators/rep_hoheisel_nick_1/",
      socials: [{ platform: "Official", url: "https://www.kslegislature.gov/b2025_26/legislators/rep_hoheisel_nick_1/" }],
    },
  },
  "Shawnee Co., KS": {
    state: "KS",
    senate: {
      party: "D",
      name: "David Haley",
      title: "KS Senate (SD-4)",
      chamber: "senate",
      profile_url: "https://www.kslegislature.gov/b2025_26/legislators/sen_haley_david_1/",
      socials: [{ platform: "Official", url: "https://www.kslegislature.gov/b2025_26/legislators/sen_haley_david_1/" }],
    },
    house: {
      party: "D",
      name: "John Alcala",
      title: "KS House (HD-57)",
      chamber: "house",
      profile_url: "https://www.kslegislature.gov/b2025_26/legislators/rep_alcala_john_1/",
      socials: [{ platform: "Official", url: "https://www.kslegislature.gov/b2025_26/legislators/rep_alcala_john_1/" }],
    },
  },
  "Knox Co., TN": {
    state: "TN",
    senate: {
      party: "R",
      name: "Becky Duncan Massey",
      title: "TN Senate (SD-6)",
      chamber: "senate",
      profile_url: "https://wapp.capitol.tn.gov/apps/LegislatorInfo/Member.aspx?District=S6",
      socials: [{ platform: "Official", url: "https://wapp.capitol.tn.gov/apps/LegislatorInfo/Member.aspx?District=S6" }],
    },
    house: {
      party: "R",
      name: "Justin Lafferty",
      title: "TN House (HD-18)",
      chamber: "house",
      profile_url: "https://wapp.capitol.tn.gov/apps/LegislatorInfo/Member.aspx?District=H18",
      socials: [{ platform: "Official", url: "https://wapp.capitol.tn.gov/apps/LegislatorInfo/Member.aspx?District=H18" }],
    },
  },
  "Charleston Co., SC": {
    state: "SC",
    senate: {
      party: "D",
      name: "Marlon Kimpson",
      title: "SC Senate (SD-42)",
      chamber: "senate",
      profile_url: "https://www.scstatehouse.gov/member.php?code=0867123412",
      socials: [{ platform: "Official", url: "https://www.scstatehouse.gov/member.php?code=0867123412" }],
    },
    house: {
      party: "D",
      name: "Wendell Gilliard",
      title: "SC House (HD-111)",
      chamber: "house",
      profile_url: "https://www.scstatehouse.gov/member.php?code=0867123413",
      socials: [{ platform: "Official", url: "https://www.scstatehouse.gov/member.php?code=0867123413" }],
    },
  },
  "Orange Co., CA": {
    state: "CA",
    senate: {
      party: "D",
      name: "Dave Min",
      title: "CA Senate (SD-37)",
      chamber: "senate",
      handle: "@CongressMin",
      profile_url: "https://x.com/CongressMin",
      socials: [{ platform: "X", handle: "@CongressMin", url: "https://x.com/CongressMin" }],
    },
    house: {
      party: "D",
      name: "Cottie Petrie-Norris",
      title: "CA Assembly (AD-73)",
      chamber: "house",
      profile_url: "https://a73.asmdc.org/",
      socials: [{ platform: "Official", url: "https://a73.asmdc.org/" }],
    },
  },
  "King Co., WA": {
    state: "WA",
    senate: {
      party: "D",
      name: "Jamie Pedersen",
      title: "WA Senate (LD-43)",
      chamber: "senate",
      profile_url: "https://leg.wa.gov/legislators/member/jamie-pedersen",
      socials: [{ platform: "Official", url: "https://leg.wa.gov/legislators/member/jamie-pedersen" }],
    },
    house: {
      party: "D",
      name: "Frank Chopp",
      title: "WA House (LD-43)",
      chamber: "house",
      profile_url: "https://leg.wa.gov/legislators/member/frank-chopp",
      socials: [{ platform: "Official", url: "https://leg.wa.gov/legislators/member/frank-chopp" }],
    },
  },
};

// Rotating state-level pairs when county lookup fails — keyed by actor bucket so each post gets different legislators.
const STATE_LEVEL_LEGISLATORS: Record<string, StateLegislatorPair[]> = {
  GA: [
    {
      state: "GA",
      senate: { party: "D", name: "Nan Orrock", title: "GA Senate (SD-36)", chamber: "senate", handle: "@NanOrrock", profile_url: "https://x.com/NanOrrock", socials: [{ platform: "X", handle: "@NanOrrock", url: "https://x.com/NanOrrock" }] },
      house: { party: "D", name: "William Boddie", title: "GA House (HD-62)", chamber: "house", profile_url: "https://www.legis.ga.gov/members/house/4993", socials: [{ platform: "Official", url: "https://www.legis.ga.gov/members/house/4993" }] },
      note: "metro Atlanta rotation 1",
    },
    {
      state: "GA",
      senate: { party: "R", name: "John Albers", title: "GA Senate (SD-56)", chamber: "senate", handle: "@JohnAlbersGA", profile_url: "https://x.com/JohnAlbersGA", socials: [{ platform: "X", handle: "@JohnAlbersGA", url: "https://x.com/JohnAlbersGA" }] },
      house: { party: "R", name: "Chuck Efstration", title: "GA House (HD-104)", chamber: "house", profile_url: "https://www.legis.ga.gov/members/house/4994", socials: [{ platform: "Official", url: "https://www.legis.ga.gov/members/house/4994" }] },
      note: "metro Atlanta rotation 2",
    },
    {
      state: "GA",
      senate: { party: "D", name: "Donzella James", title: "GA Senate (SD-35)", chamber: "senate", profile_url: "https://www.legis.ga.gov/members/senate/760", socials: [{ platform: "Official", url: "https://www.legis.ga.gov/members/senate/760" }] },
      house: { party: "D", name: "Derrick Jackson", title: "GA House (HD-64)", chamber: "house", profile_url: "https://www.legis.ga.gov/members/house/4995", socials: [{ platform: "Official", url: "https://www.legis.ga.gov/members/house/4995" }] },
      note: "metro Atlanta rotation 3",
    },
  ],
  CA: [
    {
      state: "CA",
      senate: { party: "D", name: "Scott Wiener", title: "CA Senate (SD-11)", chamber: "senate", handle: "@Scott_Wiener", profile_url: "https://x.com/Scott_Wiener", socials: [{ platform: "X", handle: "@Scott_Wiener", url: "https://x.com/Scott_Wiener" }] },
      house: { party: "D", name: "Matt Haney", title: "CA Assembly (AD-17)", chamber: "house", handle: "@MattHaneySF", profile_url: "https://x.com/MattHaneySF", socials: [{ platform: "X", handle: "@MattHaneySF", url: "https://x.com/MattHaneySF" }] },
    },
    {
      state: "CA",
      senate: { party: "D", name: "Maria Elena Durazo", title: "CA Senate (SD-26)", chamber: "senate", profile_url: "https://sd26.senate.ca.gov/", socials: [{ platform: "Official", url: "https://sd26.senate.ca.gov/" }] },
      house: { party: "D", name: "Miguel Santiago", title: "CA Assembly (AD-54)", chamber: "house", profile_url: "https://a54.asmdc.org/", socials: [{ platform: "Official", url: "https://a54.asmdc.org/" }] },
    },
    {
      state: "CA",
      senate: { party: "R", name: "Brian Jones", title: "CA Senate (SD-40)", chamber: "senate", handle: "@SenBrianJones", profile_url: "https://x.com/SenBrianJones", socials: [{ platform: "X", handle: "@SenBrianJones", url: "https://x.com/SenBrianJones" }] },
      house: { party: "R", name: "Tom Lackey", title: "CA Assembly (AD-34)", chamber: "house", profile_url: "https://a34.asmdc.org/", socials: [{ platform: "Official", url: "https://a34.asmdc.org/" }] },
    },
  ],
  MA: [
    {
      state: "MA",
      senate: { party: "D", name: "Cindy Creem", title: "MA Senate (Middlesex)", chamber: "senate", profile_url: "https://malegislature.gov/Legislators/Profile/CCG0", socials: [{ platform: "Official", url: "https://malegislature.gov/Legislators/Profile/CCG0" }] },
      house: { party: "D", name: "Kate Lipper-Garabedian", title: "MA House (HD-32)", chamber: "house", profile_url: "https://malegislature.gov/Legislators/Profile/KLG0", socials: [{ platform: "Official", url: "https://malegislature.gov/Legislators/Profile/KLG0" }] },
    },
    {
      state: "MA",
      senate: { party: "D", name: "Patricia Jehlen", title: "MA Senate (Middlesex)", chamber: "senate", profile_url: "https://malegislature.gov/Legislators/Profile/PJE0", socials: [{ platform: "Official", url: "https://malegislature.gov/Legislators/Profile/PJE0" }] },
      house: { party: "D", name: "Steve Owens", title: "MA House (HD-29)", chamber: "house", profile_url: "https://malegislature.gov/Legislators/Profile/SOW0", socials: [{ platform: "Official", url: "https://malegislature.gov/Legislators/Profile/SOW0" }] },
    },
    {
      state: "MA",
      senate: { party: "R", name: "Ryan Fattman", title: "MA Senate (Worcester)", chamber: "senate", profile_url: "https://malegislature.gov/Legislators/Profile/RAF0", socials: [{ platform: "Official", url: "https://malegislature.gov/Legislators/Profile/RAF0" }] },
      house: { party: "R", name: "Peter Durant", title: "MA House (HD-6)", chamber: "house", profile_url: "https://malegislature.gov/Legislators/Profile/PJD0", socials: [{ platform: "Official", url: "https://malegislature.gov/Legislators/Profile/PJD0" }] },
    },
  ],
  IL: [
    {
      state: "IL",
      senate: { party: "D", name: "Don Harmon", title: "IL Senate President", chamber: "senate", profile_url: "https://ilsenate.gov/Senator/District37", socials: [{ platform: "Official", url: "https://ilsenate.gov/Senator/District37" }] },
      house: { party: "D", name: "Chris Welch", title: "IL House Speaker", chamber: "house", profile_url: "https://ilhouse.gov/MemberPage?MemberID=3020", socials: [{ platform: "Official", url: "https://ilhouse.gov/MemberPage?MemberID=3020" }] },
    },
    {
      state: "IL",
      senate: { party: "D", name: "Sara Feigenholtz", title: "IL Senate (SD-6)", chamber: "senate", profile_url: "https://ilsenate.gov/Senator/District6", socials: [{ platform: "Official", url: "https://ilsenate.gov/Senator/District6" }] },
      house: { party: "D", name: "Ann Williams", title: "IL House (HD-11)", chamber: "house", profile_url: "https://ilhouse.gov/MemberPage?MemberID=3021", socials: [{ platform: "Official", url: "https://ilhouse.gov/MemberPage?MemberID=3021" }] },
    },
    {
      state: "IL",
      senate: { party: "R", name: "John Curran", title: "IL Senate (SD-41)", chamber: "senate", profile_url: "https://ilsenate.gov/Senator/District41", socials: [{ platform: "Official", url: "https://ilsenate.gov/Senator/District41" }] },
      house: { party: "R", name: "Martin McLaughlin", title: "IL House (HD-52)", chamber: "house", profile_url: "https://ilhouse.gov/MemberPage?MemberID=3022", socials: [{ platform: "Official", url: "https://ilhouse.gov/MemberPage?MemberID=3022" }] },
    },
  ],
  CO: [
    {
      state: "CO",
      senate: { party: "D", name: "Steve Fenberg", title: "CO Senate President", chamber: "senate", handle: "@SteveFenberg", profile_url: "https://x.com/SteveFenberg", socials: [{ platform: "X", handle: "@SteveFenberg", url: "https://x.com/SteveFenberg" }] },
      house: { party: "D", name: "Julie McCluskie", title: "CO House Speaker", chamber: "house", profile_url: "https://leg.colorado.gov/legislators/julie-mccluskie", socials: [{ platform: "Official", url: "https://leg.colorado.gov/legislators/julie-mccluskie" }] },
    },
    {
      state: "CO",
      senate: { party: "R", name: "Paul Lundeen", title: "CO Senate Minority Leader", chamber: "senate", profile_url: "https://leg.colorado.gov/legislators/paul-lundeen", socials: [{ platform: "Official", url: "https://leg.colorado.gov/legislators/paul-lundeen" }] },
      house: { party: "R", name: "Rose Pugliese", title: "CO House Minority Leader", chamber: "house", profile_url: "https://leg.colorado.gov/legislators/rose-pugliese", socials: [{ platform: "Official", url: "https://leg.colorado.gov/legislators/rose-pugliese" }] },
    },
  ],
  OR: [
    {
      state: "OR",
      senate: { party: "D", name: "Rob Wagner", title: "OR Senate President", chamber: "senate", profile_url: "https://www.oregonlegislature.gov/wagner", socials: [{ platform: "Official", url: "https://www.oregonlegislature.gov/wagner" }] },
      house: { party: "D", name: "Ben Bowman", title: "OR House Speaker", chamber: "house", profile_url: "https://www.oregonlegislature.gov/bowman", socials: [{ platform: "Official", url: "https://www.oregonlegislature.gov/bowman" }] },
    },
    {
      state: "OR",
      senate: { party: "R", name: "Tim Knopp", title: "OR Senate Minority Leader", chamber: "senate", profile_url: "https://www.oregonlegislature.gov/knopp", socials: [{ platform: "Official", url: "https://www.oregonlegislature.gov/knopp" }] },
      house: { party: "R", name: "Jeff Helfrich", title: "OR House Minority Leader", chamber: "house", profile_url: "https://www.oregonlegislature.gov/helfrich", socials: [{ platform: "Official", url: "https://www.oregonlegislature.gov/helfrich" }] },
    },
  ],
  PA: [
    {
      state: "PA",
      senate: { party: "D", name: "Jay Costa", title: "PA Senate Democratic Leader", chamber: "senate", profile_url: "https://www.palegis.us/senate/members/bio/178/jay-costa", socials: [{ platform: "Official", url: "https://www.palegis.us/senate/members/bio/178/jay-costa" }] },
      house: { party: "D", name: "Matt Bradford", title: "PA House Democratic Leader", chamber: "house", profile_url: "https://www.palegis.us/house/members/bio/1095/matt-bradford", socials: [{ platform: "Official", url: "https://www.palegis.us/house/members/bio/1095/matt-bradford" }] },
    },
    {
      state: "PA",
      senate: { party: "R", name: "Joe Pittman", title: "PA Senate President Pro Tempore", chamber: "senate", profile_url: "https://www.palegis.us/senate/members/bio/1687/joe-pittman", socials: [{ platform: "Official", url: "https://www.palegis.us/senate/members/bio/1687/joe-pittman" }] },
      house: { party: "R", name: "Bryan Cutler", title: "PA House Republican Leader", chamber: "house", profile_url: "https://www.palegis.us/house/members/bio/1096/bryan-cutler", socials: [{ platform: "Official", url: "https://www.palegis.us/house/members/bio/1096/bryan-cutler" }] },
    },
  ],
  RI: [
    {
      state: "RI",
      senate: { party: "D", name: "Dominick Ruggerio", title: "RI Senate President", chamber: "senate", profile_url: "https://www.rilegislature.gov/senate/Pages/Biography.aspx?LegislatorID=120", socials: [{ platform: "Official", url: "https://www.rilegislature.gov/senate/Pages/Biography.aspx?LegislatorID=120" }] },
      house: { party: "D", name: "Joseph Shekarchi", title: "RI House Speaker", chamber: "house", profile_url: "https://www.rilegislature.gov/representatives/shekarchi/Pages/Biography.aspx", socials: [{ platform: "Official", url: "https://www.rilegislature.gov/representatives/shekarchi/Pages/Biography.aspx" }] },
    },
    {
      state: "RI",
      senate: { party: "R", name: "Jessica de la Cruz", title: "RI Senate Minority Leader", chamber: "senate", profile_url: "https://www.rilegislature.gov/senate/Pages/Biography.aspx?LegislatorID=121", socials: [{ platform: "Official", url: "https://www.rilegislature.gov/senate/Pages/Biography.aspx?LegislatorID=121" }] },
      house: { party: "R", name: "Vincent Candelora", title: "RI House Minority Leader", chamber: "house", profile_url: "https://www.rilegislature.gov/representatives/candelora/Pages/Biography.aspx", socials: [{ platform: "Official", url: "https://www.rilegislature.gov/representatives/candelora/Pages/Biography.aspx" }] },
    },
  ],
  WV: [
    {
      state: "WV",
      senate: { party: "D", name: "Stephen Skinner", title: "WV Senate Democratic Leader", chamber: "senate", profile_url: "https://www.wvlegislature.gov/Senate1/lawmaker.cfm?member=Senator%20Skinner", socials: [{ platform: "Official", url: "https://www.wvlegislature.gov/Senate1/lawmaker.cfm?member=Senator%20Skinner" }] },
      house: { party: "D", name: "Sean Hornbuckle", title: "WV House Democratic Leader", chamber: "house", profile_url: "https://www.wvlegislature.gov/House/lawmaker.cfm?member=Delegate%20Hornbuckle", socials: [{ platform: "Official", url: "https://www.wvlegislature.gov/House/lawmaker.cfm?member=Delegate%20Hornbuckle" }] },
    },
    {
      state: "WV",
      senate: { party: "R", name: "Craig Blair", title: "WV Senate President", chamber: "senate", profile_url: "https://www.wvlegislature.gov/Senate1/lawmaker.cfm?member=Senator%20Blair", socials: [{ platform: "Official", url: "https://www.wvlegislature.gov/Senate1/lawmaker.cfm?member=Senator%20Blair" }] },
      house: { party: "R", name: "Roger Hanshaw", title: "WV House Speaker", chamber: "house", profile_url: "https://www.wvlegislature.gov/House/lawmaker.cfm?member=Delegate%20Hanshaw", socials: [{ platform: "Official", url: "https://www.wvlegislature.gov/House/lawmaker.cfm?member=Delegate%20Hanshaw" }] },
    },
  ],
  MT: [
    {
      state: "MT",
      senate: { party: "D", name: "Edie McClafferty", title: "MT Senate (SD-38)", chamber: "senate", profile_url: "https://leg.mt.gov/legislator-information/legislator-roster/legislator-detail/7714", socials: [{ platform: "Official", url: "https://leg.mt.gov/legislator-information/legislator-roster/legislator-detail/7714" }] },
      house: { party: "D", name: "Kendall Van Dyk", title: "MT House Democratic Leader", chamber: "house", profile_url: "https://leg.mt.gov/legislator-information/legislator-roster/legislator-detail/7713", socials: [{ platform: "Official", url: "https://leg.mt.gov/legislator-information/legislator-roster/legislator-detail/7713" }] },
    },
    {
      state: "MT",
      senate: { party: "R", name: "Matt Regier", title: "MT Senate President", chamber: "senate", profile_url: "https://leg.mt.gov/legislator-information/legislator-roster/legislator-detail/7715", socials: [{ platform: "Official", url: "https://leg.mt.gov/legislator-information/legislator-roster/legislator-detail/7715" }] },
      house: { party: "R", name: "Braxton Mitchell", title: "MT House Speaker", chamber: "house", profile_url: "https://leg.mt.gov/legislator-information/legislator-roster/legislator-detail/7716", socials: [{ platform: "Official", url: "https://leg.mt.gov/legislator-information/legislator-roster/legislator-detail/7716" }] },
    },
  ],
  MS: [
    {
      state: "MS",
      senate: { party: "D", name: "Derrick Simmons", title: "MS Senate Democratic Leader", chamber: "senate", profile_url: "http://billstatus.ls.state.ms.us/members/senate/simmons.xml", socials: [{ platform: "Official", url: "http://billstatus.ls.state.ms.us/members/senate/simmons.xml" }] },
      house: { party: "D", name: "Robert Johnson III", title: "MS House Democratic Leader", chamber: "house", profile_url: "http://billstatus.ls.state.ms.us/members/house/johnson.xml", socials: [{ platform: "Official", url: "http://billstatus.ls.state.ms.us/members/house/johnson.xml" }] },
    },
    {
      state: "MS",
      senate: { party: "R", name: "Delbert Hosemann", title: "MS Lieutenant Governor", chamber: "senate", profile_url: "https://www.sos.ms.gov/administration/Pages/Lt-Governor.aspx", socials: [{ platform: "Official", url: "https://www.sos.ms.gov/administration/Pages/Lt-Governor.aspx" }] },
      house: { party: "R", name: "Jason White", title: "MS House Speaker", chamber: "house", profile_url: "http://billstatus.ls.state.ms.us/members/house/white.xml", socials: [{ platform: "Official", url: "http://billstatus.ls.state.ms.us/members/house/white.xml" }] },
    },
  ],
  MN: [
    {
      state: "MN",
      senate: { party: "D", name: "Bobby Joe Champion", title: "MN Senate President", chamber: "senate", profile_url: "https://www.senate.mn/members/member_bio.php?mem_id=1070", socials: [{ platform: "Official", url: "https://www.senate.mn/members/member_bio.php?mem_id=1070" }] },
      house: { party: "D", name: "Melissa Hortman", title: "MN House Speaker", chamber: "house", profile_url: "https://www.house.mn/members/profile/10701", socials: [{ platform: "Official", url: "https://www.house.mn/members/profile/10701" }] },
    },
    {
      state: "MN",
      senate: { party: "R", name: "Mark Johnson", title: "MN Senate Minority Leader", chamber: "senate", profile_url: "https://www.senate.mn/members/member_bio.php?mem_id=1071", socials: [{ platform: "Official", url: "https://www.senate.mn/members/member_bio.php?mem_id=1071" }] },
      house: { party: "R", name: "Lisa Demuth", title: "MN House Minority Leader", chamber: "house", profile_url: "https://www.house.mn/members/profile/10702", socials: [{ platform: "Official", url: "https://www.house.mn/members/profile/10702" }] },
    },
  ],
  MO: [
    {
      state: "MO",
      senate: { party: "D", name: "Gina Walsh", title: "MO Senate Democratic Leader", chamber: "senate", profile_url: "https://www.senate.mo.gov/LegisLookup/member.aspx?district=13", socials: [{ platform: "Official", url: "https://www.senate.mo.gov/LegisLookup/member.aspx?district=13" }] },
      house: { party: "D", name: "Crystal Quade", title: "MO House Democratic Leader", chamber: "house", profile_url: "https://house.mo.gov/Member.aspx?district=135", socials: [{ platform: "Official", url: "https://house.mo.gov/Member.aspx?district=135" }] },
    },
    {
      state: "MO",
      senate: { party: "R", name: "Caleb Rowden", title: "MO Senate Majority Leader", chamber: "senate", profile_url: "https://www.senate.mo.gov/LegisLookup/member.aspx?district=19", socials: [{ platform: "Official", url: "https://www.senate.mo.gov/LegisLookup/member.aspx?district=19" }] },
      house: { party: "R", name: "Jon Patterson", title: "MO House Speaker", chamber: "house", profile_url: "https://house.mo.gov/Member.aspx?district=30", socials: [{ platform: "Official", url: "https://house.mo.gov/Member.aspx?district=30" }] },
    },
  ],
  KY: [
    {
      state: "KY",
      senate: { party: "D", name: "Gerald Neal", title: "KY Senate Democratic Leader", chamber: "senate", profile_url: "https://legislature.ky.gov/Legislators/Pages/Legislator-Profile.aspx?DistrictNumber=33", socials: [{ platform: "Official", url: "https://legislature.ky.gov/Legislators/Pages/Legislator-Profile.aspx?DistrictNumber=33" }] },
      house: { party: "D", name: "Cherlynn Stevenson", title: "KY House Democratic Leader", chamber: "house", profile_url: "https://legislature.ky.gov/Legislators/Pages/Legislator-Profile.aspx?DistrictNumber=35", socials: [{ platform: "Official", url: "https://legislature.ky.gov/Legislators/Pages/Legislator-Profile.aspx?DistrictNumber=35" }] },
    },
    {
      state: "KY",
      senate: { party: "R", name: "Robert Stivers", title: "KY Senate President", chamber: "senate", profile_url: "https://legislature.ky.gov/Legislators/Pages/Legislator-Profile.aspx?DistrictNumber=25", socials: [{ platform: "Official", url: "https://legislature.ky.gov/Legislators/Pages/Legislator-Profile.aspx?DistrictNumber=25" }] },
      house: { party: "R", name: "David Osborne", title: "KY House Speaker", chamber: "house", profile_url: "https://legislature.ky.gov/Legislators/Pages/Legislator-Profile.aspx?DistrictNumber=59", socials: [{ platform: "Official", url: "https://legislature.ky.gov/Legislators/Pages/Legislator-Profile.aspx?DistrictNumber=59" }] },
    },
  ],
  LA: [
    {
      state: "LA",
      senate: { party: "D", name: "Gary Carter", title: "LA Senate (SD-7)", chamber: "senate", profile_url: "https://senate.la.gov/Senators/SenPage.aspx?ID=123", socials: [{ platform: "Official", url: "https://senate.la.gov/Senators/SenPage.aspx?ID=123" }] },
      house: { party: "D", name: "Matthew Willard", title: "LA House (HD-97)", chamber: "house", profile_url: "https://house.la.gov/H_Reps/members.aspx?ID=123", socials: [{ platform: "Official", url: "https://house.la.gov/H_Reps/members.aspx?ID=123" }] },
    },
    {
      state: "LA",
      senate: { party: "R", name: "Page Cortez", title: "LA Senate President", chamber: "senate", profile_url: "https://senate.la.gov/Senators/SenPage.aspx?ID=124", socials: [{ platform: "Official", url: "https://senate.la.gov/Senators/SenPage.aspx?ID=124" }] },
      house: { party: "R", name: "Phillip DeVillier", title: "LA House Speaker", chamber: "house", profile_url: "https://house.la.gov/H_Reps/members.aspx?ID=124", socials: [{ platform: "Official", url: "https://house.la.gov/H_Reps/members.aspx?ID=124" }] },
    },
  ],
  UT: [
    {
      state: "UT",
      senate: { party: "D", name: "Angela Romero", title: "UT Senate Democratic Leader", chamber: "senate", profile_url: "https://le.utah.gov/senate/curriculum-and-member-information/romero-angela/", socials: [{ platform: "Official", url: "https://le.utah.gov/senate/curriculum-and-member-information/romero-angela/" }] },
      house: { party: "D", name: "Angela Romero", title: "UT House Democratic Leader", chamber: "house", profile_url: "https://le.utah.gov/house/curriculum-and-member-information/romero-angela/", socials: [{ platform: "Official", url: "https://le.utah.gov/house/curriculum-and-member-information/romero-angela/" }], note: "unicameral-style leadership rotation" },
    },
    {
      state: "UT",
      senate: { party: "R", name: "Stuart Adams", title: "UT Senate President", chamber: "senate", profile_url: "https://le.utah.gov/senate/curriculum-and-member-information/adams-stuart/", socials: [{ platform: "Official", url: "https://le.utah.gov/senate/curriculum-and-member-information/adams-stuart/" }] },
      house: { party: "R", name: "Mike Schultz", title: "UT House Speaker", chamber: "house", profile_url: "https://le.utah.gov/house/curriculum-and-member-information/schultz-mike/", socials: [{ platform: "Official", url: "https://le.utah.gov/house/curriculum-and-member-information/schultz-mike/" }] },
    },
  ],
  TN: [
    {
      state: "TN",
      senate: { party: "D", name: "London Lamar", title: "TN Senate (SD-33)", chamber: "senate", profile_url: "https://wapp.capitol.tn.gov/apps/LegislatorInfo/Member.aspx?District=S33", socials: [{ platform: "Official", url: "https://wapp.capitol.tn.gov/apps/LegislatorInfo/Member.aspx?District=S33" }] },
      house: { party: "D", name: "Gloria Johnson", title: "TN House (HD-90)", chamber: "house", handle: "@GloriaJohnsonTN", profile_url: "https://x.com/GloriaJohnsonTN", socials: [{ platform: "X", handle: "@GloriaJohnsonTN", url: "https://x.com/GloriaJohnsonTN" }] },
    },
    {
      state: "TN",
      senate: { party: "R", name: "Randy McNally", title: "TN Senate Speaker", chamber: "senate", profile_url: "https://wapp.capitol.tn.gov/apps/LegislatorInfo/Member.aspx?District=S5", socials: [{ platform: "Official", url: "https://wapp.capitol.tn.gov/apps/LegislatorInfo/Member.aspx?District=S5" }] },
      house: { party: "R", name: "Cameron Sexton", title: "TN House Speaker", chamber: "house", profile_url: "https://wapp.capitol.tn.gov/apps/LegislatorInfo/Member.aspx?District=H35", socials: [{ platform: "Official", url: "https://wapp.capitol.tn.gov/apps/LegislatorInfo/Member.aspx?District=H35" }] },
    },
  ],
  NC: [
    {
      state: "NC",
      senate: { party: "D", name: "Dan Blue", title: "NC Senate Democratic Leader", chamber: "senate", profile_url: "https://www.ncleg.gov/Members/Biography/S/222", socials: [{ platform: "Official", url: "https://www.ncleg.gov/Members/Biography/S/222" }] },
      house: { party: "D", name: "Robert Reives", title: "NC House Democratic Leader", chamber: "house", profile_url: "https://www.ncleg.gov/Members/Biography/H/222", socials: [{ platform: "Official", url: "https://www.ncleg.gov/Members/Biography/H/222" }] },
    },
    {
      state: "NC",
      senate: { party: "R", name: "Phil Berger", title: "NC Senate President Pro Tem", chamber: "senate", profile_url: "https://www.ncleg.gov/Members/Biography/S/223", socials: [{ platform: "Official", url: "https://www.ncleg.gov/Members/Biography/S/223" }] },
      house: { party: "R", name: "Destin Hall", title: "NC House Speaker", chamber: "house", profile_url: "https://www.ncleg.gov/Members/Biography/H/223", socials: [{ platform: "Official", url: "https://www.ncleg.gov/Members/Biography/H/223" }] },
    },
    {
      state: "NC",
      senate: { party: "D", name: "Sydney Batch", title: "NC Senate (SD-17)", chamber: "senate", handle: "@SydneyBatchNC", profile_url: "https://x.com/SydneyBatchNC", socials: [{ platform: "X", handle: "@SydneyBatchNC", url: "https://x.com/SydneyBatchNC" }] },
      house: { party: "D", name: "Julie von Haefen", title: "NC House (HD-36)", chamber: "house", handle: "@JulieVonHaefen", profile_url: "https://x.com/JulieVonHaefen", socials: [{ platform: "X", handle: "@JulieVonHaefen", url: "https://x.com/JulieVonHaefen" }] },
    },
  ],
  OH: [
    {
      state: "OH",
      senate: { party: "D", name: "Nickie Antonio", title: "OH Senate Democratic Leader", chamber: "senate", profile_url: "https://www.ohiosenate.gov/members/nickie-antonio", socials: [{ platform: "Official", url: "https://www.ohiosenate.gov/members/nickie-antonio" }] },
      house: { party: "D", name: "Allison Russo", title: "OH House Democratic Leader", chamber: "house", profile_url: "https://www.ohiohouse.gov/members/allison-russo", socials: [{ platform: "Official", url: "https://www.ohiohouse.gov/members/allison-russo" }] },
    },
    {
      state: "OH",
      senate: { party: "R", name: "Matt Huffman", title: "OH Senate President", chamber: "senate", profile_url: "https://www.ohiosenate.gov/members/matt-huffman", socials: [{ platform: "Official", url: "https://www.ohiosenate.gov/members/matt-huffman" }] },
      house: { party: "R", name: "Jason Stephens", title: "OH House Speaker", chamber: "house", profile_url: "https://www.ohiohouse.gov/members/jason-stephens", socials: [{ platform: "Official", url: "https://www.ohiohouse.gov/members/jason-stephens" }] },
    },
  ],
  TX: [
    {
      state: "TX",
      senate: { party: "D", name: "Royce West", title: "TX Senate (SD-23)", chamber: "senate", handle: "@SenRoyceWest", profile_url: "https://x.com/SenRoyceWest", socials: [{ platform: "X", handle: "@SenRoyceWest", url: "https://x.com/SenRoyceWest" }] },
      house: { party: "D", name: "Rafael Anchía", title: "TX House (HD-103)", chamber: "house", handle: "@RafaelAnchia", profile_url: "https://x.com/RafaelAnchia", socials: [{ platform: "X", handle: "@RafaelAnchia", url: "https://x.com/RafaelAnchia" }] },
    },
    {
      state: "TX",
      senate: { party: "R", name: "Angela Paxton", title: "TX Senate (SD-8)", chamber: "senate", handle: "@AngelaPaxtonTX", profile_url: "https://x.com/AngelaPaxtonTX", socials: [{ platform: "X", handle: "@AngelaPaxtonTX", url: "https://x.com/AngelaPaxtonTX" }] },
      house: { party: "R", name: "Jeff Leach", title: "TX House (HD-67)", chamber: "house", handle: "@leachfortexas", profile_url: "https://x.com/leachfortexas", socials: [{ platform: "X", handle: "@leachfortexas", url: "https://x.com/leachfortexas" }] },
    },
    {
      state: "TX",
      senate: { party: "R", name: "Brent Hagenbuch", title: "TX Senate (SD-30)", chamber: "senate", profile_url: "https://senate.texas.gov/member.php?d=30", socials: [{ platform: "Official", url: "https://senate.texas.gov/member.php?d=30" }] },
      house: { party: "R", name: "Andy Hopper", title: "TX House (HD-64)", chamber: "house", handle: "@AndyHopperTX", profile_url: "https://x.com/AndyHopperTX", socials: [{ platform: "X", handle: "@AndyHopperTX", url: "https://x.com/AndyHopperTX" }] },
    },
  ],
  FL: [
    {
      state: "FL",
      senate: { party: "D", name: "Rosalind Osgood", title: "FL Senate (SD-32)", chamber: "senate", handle: "@ReverendRos", profile_url: "https://x.com/ReverendRos", socials: [{ platform: "X", handle: "@ReverendRos", url: "https://x.com/ReverendRos" }, { platform: "Instagram", handle: "@senatorosgood", url: "https://www.instagram.com/senatorosgood/" }] },
      house: { party: "D", name: "Daryl Campbell", title: "FL House (HD-99)", chamber: "house", handle: "@RepCampbell_FL", profile_url: "https://x.com/RepCampbell_FL", socials: [{ platform: "X", handle: "@RepCampbell_FL", url: "https://x.com/RepCampbell_FL" }] },
    },
    {
      state: "FL",
      senate: { party: "R", name: "Tom Wright", title: "FL Senate (SD-8)", chamber: "senate", handle: "@SenTomWright", profile_url: "https://x.com/SenTomWright", socials: [{ platform: "X", handle: "@SenTomWright", url: "https://x.com/SenTomWright" }] },
      house: { party: "R", name: "Webster Barnaby", title: "FL House (HD-29)", chamber: "house", handle: "@websterbarnaby", profile_url: "https://x.com/websterbarnaby", socials: [{ platform: "X", handle: "@websterbarnaby", url: "https://x.com/websterbarnaby" }] },
    },
  ],
  IN: [
    {
      state: "IN",
      senate: { party: "D", name: "Greg Taylor", title: "IN Senate Democratic Leader", chamber: "senate", profile_url: "https://iga.in.gov/legislative/find-legislators/legislator/greg-taylor", socials: [{ platform: "Official", url: "https://iga.in.gov/legislative/find-legislators/legislator/greg-taylor" }] },
      house: { party: "D", name: "Phil GiaQuinta", title: "IN House Democratic Leader", chamber: "house", profile_url: "https://iga.in.gov/legislative/find-legislators/legislator/phil-giaquinta", socials: [{ platform: "Official", url: "https://iga.in.gov/legislative/find-legislators/legislator/phil-giaquinta" }] },
    },
    {
      state: "IN",
      senate: { party: "R", name: "Ryan Mishler", title: "IN Senate (SD-9)", chamber: "senate", profile_url: "https://iga.in.gov/legislative/find-legislators/legislator/ryan-mishler", socials: [{ platform: "Official", url: "https://iga.in.gov/legislative/find-legislators/legislator/ryan-mishler" }] },
      house: { party: "R", name: "Doug Miller", title: "IN House (HD-48)", chamber: "house", profile_url: "https://iga.in.gov/legislative/find-legislators/legislator/doug-miller", socials: [{ platform: "Official", url: "https://iga.in.gov/legislative/find-legislators/legislator/doug-miller" }] },
    },
  ],
  IA: [
    {
      state: "IA",
      senate: { party: "D", name: "Janice Weiner", title: "IA Senate (SD-36)", chamber: "senate", handle: "@JaniceWeinerIA", profile_url: "https://x.com/JaniceWeinerIA", socials: [{ platform: "X", handle: "@JaniceWeinerIA", url: "https://x.com/JaniceWeinerIA" }] },
      house: { party: "D", name: "Brian Meyer", title: "IA House (HD-29)", chamber: "house", profile_url: "https://www.legis.iowa.gov/legislators/legislator?ga=91&personID=30652", socials: [{ platform: "Official", url: "https://www.legis.iowa.gov/legislators/legislator?ga=91&personID=30652" }] },
    },
    {
      state: "IA",
      senate: { party: "R", name: "Jack Whitver", title: "IA Senate President", chamber: "senate", profile_url: "https://www.legis.iowa.gov/legislators/legislator?ga=91&personID=30653", socials: [{ platform: "Official", url: "https://www.legis.iowa.gov/legislators/legislator?ga=91&personID=30653" }] },
      house: { party: "R", name: "Pat Grassley", title: "IA House Speaker", chamber: "house", profile_url: "https://www.legis.iowa.gov/legislators/legislator?ga=91&personID=30654", socials: [{ platform: "Official", url: "https://www.legis.iowa.gov/legislators/legislator?ga=91&personID=30654" }] },
    },
  ],
  KS: [
    {
      state: "KS",
      senate: { party: "D", name: "David Haley", title: "KS Senate (SD-4)", chamber: "senate", profile_url: "https://www.kslegislature.gov/b2025_26/legislators/sen_haley_david_1/", socials: [{ platform: "Official", url: "https://www.kslegislature.gov/b2025_26/legislators/sen_haley_david_1/" }] },
      house: { party: "D", name: "John Alcala", title: "KS House (HD-57)", chamber: "house", profile_url: "https://www.kslegislature.gov/b2025_26/legislators/rep_alcala_john_1/", socials: [{ platform: "Official", url: "https://www.kslegislature.gov/b2025_26/legislators/rep_alcala_john_1/" }] },
    },
    {
      state: "KS",
      senate: { party: "R", name: "Adam Thomas", title: "KS Senate (SD-23)", chamber: "senate", profile_url: "https://www.kslegislature.gov/b2025_26/legislators/sen_thomas_adam_1/", socials: [{ platform: "Official", url: "https://www.kslegislature.gov/b2025_26/legislators/sen_thomas_adam_1/" }] },
      house: { party: "R", name: "Lauren Bohi", title: "KS House (HD-15)", chamber: "house", handle: "@LaurenBohiKS", profile_url: "https://x.com/LaurenBohiKS", socials: [{ platform: "X", handle: "@LaurenBohiKS", url: "https://x.com/LaurenBohiKS" }] },
    },
    {
      state: "KS",
      senate: { party: "R", name: "Ty Masterson", title: "KS Senate (SD-16)", chamber: "senate", handle: "@TyMastersonKS", profile_url: "https://x.com/TyMastersonKS", socials: [{ platform: "X", handle: "@TyMastersonKS", url: "https://x.com/TyMastersonKS" }] },
      house: { party: "R", name: "Nick Hoheisel", title: "KS House (HD-97)", chamber: "house", profile_url: "https://www.kslegislature.gov/b2025_26/legislators/rep_hoheisel_nick_1/", socials: [{ platform: "Official", url: "https://www.kslegislature.gov/b2025_26/legislators/rep_hoheisel_nick_1/" }] },
    },
  ],
};

function isUsableCounty(county: string | null | undefined): boolean {
  if (!county) return false;
  const lower = county.toLowerCase().trim();
  if (
    lower.includes("not listed") ||
    lower === "unknown" ||
    lower.includes("cps") ||
    lower.includes("dfcs") ||
    lower.includes("attorney") ||
    lower.includes("evaluator") ||
    lower.includes("psychologist") ||
    lower.includes("caseworker") ||
    lower.includes("judicial circuit") ||
    lower.includes("family court div") ||
    lower === "oregon"
  ) {
    return false;
  }
  return true;
}

function normalizeCountyLabel(county: string | null | undefined, stateAbbr: string): string | null {
  if (!isUsableCounty(county)) return null;
  if (!county) return null;
  const st = stateAbbr.toUpperCase();
  // Pull out the leading county/parish name before extra text like "Court, City".
  const match = county.match(/^([A-Za-z][A-Za-z\s]*?)\s*(?:County|Parish|Co\.?)?\b/i);
  const raw = match ? match[1] : county;
  const clean = raw
    .replace(/\bcounty\b/gi, "")
    .replace(/\bparish\b/gi, "")
    .replace(/\bco\.?\b/gi, "")
    .replace(/,/g, "")
    .trim();
  if (!clean) return null;
  return `${clean} Co., ${st}`;
}

function countyLookupKey(county: string | null | undefined, stateAbbr: string): string | null {
  return normalizeCountyLabel(county, stateAbbr);
}

function stableIndex(seed: string | null | undefined, modulo: number): number {
  if (modulo <= 1) return 0;
  const input = seed || "default";
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % modulo;
}

export function pickCongressTags(stateAbbr: string): {
  democrat: CongressPick;
  republican: CongressPick;
} | null;
export function pickCongressTags(stateAbbr: string, seed?: string | null): {
  democrat: CongressPick;
  republican: CongressPick;
} | null;
export function pickCongressTags(stateAbbr: string, seed?: string | null): {
  democrat: CongressPick;
  republican: CongressPick;
} | null {
  const st = stateAbbr.toUpperCase();
  const roster = CONGRESS_ROSTER[st];
  if (!roster || roster.D.length === 0 || roster.R.length === 0) return null;
  const offset = stableIndex(seed, Math.max(roster.D.length, roster.R.length));
  return {
    democrat: enrichSocials({ party: "D", ...roster.D[offset % roster.D.length] }) as CongressPick,
    republican: enrichSocials({ party: "R", ...roster.R[offset % roster.R.length] }) as CongressPick,
  };
}

function pickStateLevelFallback(
  stateAbbr: string,
  seed?: string | null,
): { senate: StateLegislatorPick; house: StateLegislatorPick } | null {
  const st = stateAbbr.toUpperCase();
  const pool = STATE_LEVEL_LEGISLATORS[st];
  if (!pool || pool.length === 0) return null;

  // Always attempt to return one Democrat and one Republican for state legislators.
  const all = pool.flatMap(p => [p.senate, p.house]);
  const ds = all.filter(p => p.party === "D");
  const rs = all.filter(p => p.party === "R");

  if (ds.length > 0 && rs.length > 0) {
    const d = ds[stableIndex((seed || "") + "|d", ds.length)];
    const r = rs[stableIndex((seed || "") + "|r", rs.length)];
    // Assign to senate/house preferring their native chamber when possible.
    let senate: StateLegislatorPick = d;
    let house: StateLegislatorPick = r;
    if (d.chamber === "house" && r.chamber === "senate") {
      senate = r;
      house = d;
    } else if (d.chamber === "senate" && r.chamber === "house") {
      senate = d;
      house = r;
    } else if (r.chamber === "senate") {
      senate = r;
      house = d;
    }
    return {
      senate: enrichSocials(senate) as StateLegislatorPick,
      house: enrichSocials(house) as StateLegislatorPick,
    };
  }

  // Fallback to rotating pair + balance if no cross-party available.
  const selected = pool[stableIndex(seed, pool.length)];
  return {
    senate: enrichSocials(selected.senate) as StateLegislatorPick,
    house: enrichSocials(selected.house) as StateLegislatorPick,
  };
}

function pickOppositePartyStateLegislator(
  stateAbbr: string,
  desiredParty: "D" | "R",
  seed?: string | null,
): StateLegislatorPick | null {
  const st = stateAbbr.toUpperCase();
  const pool = STATE_LEVEL_LEGISLATORS[st];
  if (!pool || pool.length === 0) return null;

  const candidates = pool.flatMap(pair => [pair.senate, pair.house])
    .filter(pick => pick.party === desiredParty);
  if (candidates.length === 0) return null;
  return enrichSocials(candidates[stableIndex(seed, candidates.length)]) as StateLegislatorPick;
}

function balanceStateLegislatorPair(
  pair: { senate: StateLegislatorPick; house: StateLegislatorPick },
  stateAbbr: string,
  seed?: string | null,
): { senate: StateLegislatorPick; house: StateLegislatorPick } {
  const senateParty = pair.senate.party;
  const houseParty = pair.house.party;
  if ((senateParty !== "D" && senateParty !== "R") || senateParty !== houseParty) {
    return pair;
  }

  const desiredParty = senateParty === "D" ? "R" : "D";
  const opposite = pickOppositePartyStateLegislator(stateAbbr, desiredParty, seed);
  if (!opposite) return pair;

  return opposite.chamber === "senate"
    ? { senate: opposite, house: pair.house }
    : { senate: pair.senate, house: opposite };
}

export function pickStateLegislators(
  county: string | null | undefined,
  stateAbbr: string,
  seed?: string | null,
): { senate: StateLegislatorPick; house: StateLegislatorPick } | null {
  const key = countyLookupKey(county, stateAbbr);
  if (key) {
    const hit = COUNTY_STATE_LEGISLATORS[key];
    if (hit) {
      const selected = Array.isArray(hit) ? hit[stableIndex(seed, hit.length)] : hit;
      return balanceStateLegislatorPair({
        senate: enrichSocials(selected.senate) as StateLegislatorPick,
        house: enrichSocials(selected.house) as StateLegislatorPick,
      }, stateAbbr, seed);
    }
  }
  const fallback = pickStateLevelFallback(stateAbbr, seed);
  return fallback ? balanceStateLegislatorPair(fallback, stateAbbr, seed) : null;
}

export type LegislatorBlock = {
  congressD: CongressPick;
  congressR: CongressPick;
  stateSenate?: StateLegislatorPick;
  stateHouse?: StateLegislatorPick;
  locationTag: string;
};

export function buildLegislatorBlock(args: {
  stateAbbr: string;
  county: string | null | undefined;
  rotationKey?: string | null;
}): { block: LegislatorBlock | null; missing: string[] } {
  const { stateAbbr, county, rotationKey } = args;
  const missing: string[] = [];

  const congress = pickCongressTags(stateAbbr, rotationKey ?? county);
  if (!congress) missing.push(`Congress roster for ${stateAbbr}`);

  const stateLeg = pickStateLegislators(county, stateAbbr, rotationKey);
  if (!stateLeg) {
    missing.push(`state legislators for ${county || "unknown county"}, ${stateAbbr}`);
  }

  if (!congress) {
    return { block: null, missing };
  }

  return {
    block: {
      congressD: congress.democrat,
      congressR: congress.republican,
      ...(stateLeg ? { stateSenate: stateLeg.senate, stateHouse: stateLeg.house } : {}),
      locationTag: stateCapitolTag(stateAbbr),
    },
    missing,
  };
}

export function formatFirstComment(block: LegislatorBlock, stateAbbr: string, county: string | null): string {
  const st = stateAbbr.toUpperCase();
  const countyDisplay = county && isUsableCounty(county)
    ? /\b(county|parish)\b/i.test(county)
      ? county
      : `${county} Co.`
    : `${stateName(st)}`;

  const lines = [
    "📣 Congress — follow + tag:",
    `• ${formatSocialLinkLine(block.congressD.name, "D", block.congressD)}`,
    `• ${formatSocialLinkLine(block.congressR.name, "R", block.congressR)}`,
  ];

  if (block.stateSenate && block.stateHouse) {
    lines.push(
      "",
      `🏛️ ${stateName(st)} state legislators (${countyDisplay}) — follow + tag:`,
      `• State Senate: ${formatSocialLinkLine(block.stateSenate.name, block.stateSenate.title, block.stateSenate)}`,
      `• State House: ${formatSocialLinkLine(block.stateHouse.name, block.stateHouse.title, block.stateHouse)}`,
    );
  }

  lines.push("", `${stateName(st)} families are on the public record. Your representatives are asked to look. standwithmeg.com`);
  return lines.join("\n");
}
