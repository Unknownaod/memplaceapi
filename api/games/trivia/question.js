import crypto from "crypto";

import { setCors } from "../../../lib/cors.js";
import { getAuthenticatedUser } from "../../../lib/auth.js";
import { getDb } from "../../../lib/mongodb.js";


/* ==========================================
   TRIVIA QUESTIONS
========================================== */

/* ==========================================
   TRIVIA QUESTIONS
   150 HARD QUESTIONS
========================================== */

const QUESTIONS = [

  {
    id: "q1",
    question: "Which ancient civilization developed the world's earliest known writing system, cuneiform?",
    choices: ["Sumerians", "Phoenicians", "Hittites", "Minoans"],
    answer: 0
  },

  {
    id: "q2",
    question: "Which modern country contains the ancient city of Persepolis?",
    choices: ["Iraq", "Iran", "Syria", "Turkey"],
    answer: 1
  },

  {
    id: "q3",
    question: "What was the ancient Egyptian writing system consisting of pictorial symbols called?",
    choices: ["Cuneiform", "Demotic", "Hieroglyphics", "Linear B"],
    answer: 2
  },

  {
    id: "q4",
    question: "Which ancient civilization is associated with the city of Hattusa?",
    choices: ["Hittites", "Assyrians", "Sumerians", "Nabataeans"],
    answer: 0
  },

  {
    id: "q5",
    question: "The ancient city of Palmyra is located in which modern country?",
    choices: ["Jordan", "Syria", "Lebanon", "Iraq"],
    answer: 1
  },

  {
    id: "q6",
    question: "Which ancient people established the city of Carthage?",
    choices: ["Romans", "Greeks", "Phoenicians", "Persians"],
    answer: 2
  },

  {
    id: "q7",
    question: "Which modern country contains the ruins of the ancient city of Babylon?",
    choices: ["Iraq", "Iran", "Syria", "Kuwait"],
    answer: 0
  },

  {
    id: "q8",
    question: "What was the capital of the Neo-Assyrian Empire under Ashurbanipal?",
    choices: ["Nineveh", "Ur", "Babylon", "Nimrud"],
    answer: 0
  },

  {
    id: "q9",
    question: "Which ancient civilization created the Epic of Gilgamesh?",
    choices: ["Egyptians", "Sumerians", "Persians", "Phoenicians"],
    answer: 1
  },

  {
    id: "q10",
    question: "Which empire famously used Persepolis as one of its ceremonial capitals?",
    choices: ["Roman Empire", "Achaemenid Empire", "Byzantine Empire", "Ottoman Empire"],
    answer: 1
  },

  {
    id: "q11",
    question: "Which ancient city was traditionally founded by Dido?",
    choices: ["Tyre", "Carthage", "Alexandria", "Antioch"],
    answer: 1
  },

  {
    id: "q12",
    question: "Which civilization is credited with developing the alphabetic writing system that influenced Greek and Latin alphabets?",
    choices: ["Phoenicians", "Sumerians", "Hittites", "Egyptians"],
    answer: 0
  },

  {
    id: "q13",
    question: "Which ancient kingdom had its capital at Petra?",
    choices: ["Nabataean Kingdom", "Seleucid Empire", "Sassanian Empire", "Kingdom of Lydia"],
    answer: 0
  },

  {
    id: "q14",
    question: "Which ancient city was located near modern-day Mosul and served as an Assyrian capital?",
    choices: ["Nineveh", "Uruk", "Mari", "Ebla"],
    answer: 0
  },

  {
    id: "q15",
    question: "Which civilization built the ziggurat at Ur?",
    choices: ["Babylonians", "Sumerians", "Romans", "Persians"],
    answer: 1
  },

  {
    id: "q16",
    question: "Which empire conquered Babylon in 539 BCE under Cyrus the Great?",
    choices: ["Roman Empire", "Achaemenid Persian Empire", "Seleucid Empire", "Assyrian Empire"],
    answer: 1
  },

  {
    id: "q17",
    question: "Which Persian ruler ordered the construction of the Behistun Inscription?",
    choices: ["Cyrus the Great", "Darius I", "Xerxes I", "Artaxerxes I"],
    answer: 1
  },

  {
    id: "q18",
    question: "The Behistun Inscription was written in Old Persian, Elamite, and which third language?",
    choices: ["Aramaic", "Greek", "Akkadian", "Egyptian"],
    answer: 2
  },

  {
    id: "q19",
    question: "Which ancient empire was centered around the city of Hattusa?",
    choices: ["Hittite Empire", "Median Empire", "Seleucid Empire", "Nabataean Kingdom"],
    answer: 0
  },

  {
    id: "q20",
    question: "Which civilization used Linear B to record an early form of Greek?",
    choices: ["Minoans", "Mycenaeans", "Phoenicians", "Hittites"],
    answer: 1
  },

  {
    id: "q21",
    question: "Which modern country contains the ancient site of Ugarit?",
    choices: ["Lebanon", "Syria", "Turkey", "Iraq"],
    answer: 1
  },

  {
    id: "q22",
    question: "The Rosetta Stone contains inscriptions in Greek, Demotic, and which form of Egyptian writing?",
    choices: ["Hieroglyphics", "Cuneiform", "Linear A", "Phoenician"],
    answer: 0
  },

  {
    id: "q23",
    question: "Which pharaoh's tomb was discovered largely intact by Howard Carter in 1922?",
    choices: ["Ramesses II", "Tutankhamun", "Akhenaten", "Thutmose III"],
    answer: 1
  },

  {
    id: "q24",
    question: "Which Egyptian pharaoh is associated with the religious revolution centered on Aten?",
    choices: ["Akhenaten", "Khufu", "Seti I", "Amenhotep II"],
    answer: 0
  },

  {
    id: "q25",
    question: "Which ancient Egyptian queen ruled as pharaoh and commissioned a famous temple at Deir el-Bahari?",
    choices: ["Nefertiti", "Cleopatra VII", "Hatshepsut", "Nefertari"],
    answer: 2
  },

  {
    id: "q26",
    question: "Which Roman emperor founded Constantinople as the new imperial capital?",
    choices: ["Diocletian", "Constantine I", "Theodosius I", "Justinian I"],
    answer: 1
  },

  {
    id: "q27",
    question: "Which battle in 636 CE was a major victory for the Rashidun Caliphate over the Byzantine Empire?",
    choices: ["Battle of Yarmouk", "Battle of Tours", "Battle of Manzikert", "Battle of Talas"],
    answer: 0
  },

  {
    id: "q28",
    question: "Which city was the capital of the Umayyad Caliphate?",
    choices: ["Baghdad", "Damascus", "Cairo", "Kufa"],
    answer: 1
  },

  {
    id: "q29",
    question: "Which city became the capital of the Abbasid Caliphate?",
    choices: ["Damascus", "Baghdad", "Medina", "Basra"],
    answer: 1
  },

  {
    id: "q30",
    question: "Who founded Baghdad as the capital of the Abbasid Caliphate in the 8th century?",
    choices: ["Harun al-Rashid", "Al-Mansur", "Al-Ma'mun", "Al-Mutawakkil"],
    answer: 1
  },

  {
    id: "q31",
    question: "Which Abbasid caliph is particularly associated with the House of Wisdom's intellectual flourishing?",
    choices: ["Al-Ma'mun", "Al-Mansur", "Al-Mu'tasim", "Al-Mutawakkil"],
    answer: 0
  },

  {
    id: "q32",
    question: "Which medieval Muslim scholar wrote the Kitab al-Hind?",
    choices: ["Al-Khwarizmi", "Al-Biruni", "Ibn Sina", "Al-Farabi"],
    answer: 1
  },

  {
    id: "q33",
    question: "Which scholar is most closely associated with the systematic development of algebra?",
    choices: ["Ibn Battuta", "Al-Khwarizmi", "Al-Razi", "Ibn Rushd"],
    answer: 1
  },

  {
    id: "q34",
    question: "The word 'algorithm' ultimately derives from the Latinized name of which scholar?",
    choices: ["Al-Khwarizmi", "Al-Biruni", "Ibn Sina", "Al-Farabi"],
    answer: 0
  },

  {
    id: "q35",
    question: "Which philosopher was known in Latin Europe as Averroes?",
    choices: ["Ibn Sina", "Ibn Rushd", "Al-Ghazali", "Al-Farabi"],
    answer: 1
  },

  {
    id: "q36",
    question: "Which physician wrote the Canon of Medicine?",
    choices: ["Ibn Sina", "Al-Razi", "Ibn Rushd", "Al-Zahrawi"],
    answer: 0
  },

  {
    id: "q37",
    question: "Which medieval physician is often called the father of surgery and wrote Al-Tasrif?",
    choices: ["Al-Razi", "Al-Zahrawi", "Ibn Sina", "Ibn al-Nafis"],
    answer: 1
  },

  {
    id: "q38",
    question: "Which physician is traditionally credited with describing pulmonary circulation centuries before William Harvey?",
    choices: ["Ibn al-Nafis", "Al-Zahrawi", "Ibn Sina", "Al-Razi"],
    answer: 0
  },

  {
    id: "q39",
    question: "Which traveler wrote the Rihla describing his extensive journeys across Africa, Asia, and Europe?",
    choices: ["Al-Idrisi", "Ibn Battuta", "Al-Masudi", "Ibn Khaldun"],
    answer: 1
  },

  {
    id: "q40",
    question: "Who wrote the Muqaddimah, a foundational work of historiography and social theory?",
    choices: ["Ibn Khaldun", "Ibn Rushd", "Al-Farabi", "Al-Biruni"],
    answer: 0
  },

  {
    id: "q41",
    question: "Which medieval geographer created the Tabula Rogeriana?",
    choices: ["Al-Idrisi", "Ibn Battuta", "Al-Masudi", "Al-Kindi"],
    answer: 0
  },

  {
    id: "q42",
    question: "Which dynasty established the famous Alhambra palace complex in Granada?",
    choices: ["Umayyads", "Nasrids", "Almohads", "Ayyubids"],
    answer: 1
  },

  {
    id: "q43",
    question: "The Battle of Manzikert in 1071 was fought primarily between the Byzantine Empire and which power?",
    choices: ["Mamluks", "Seljuk Turks", "Ottomans", "Fatimids"],
    answer: 1
  },

  {
    id: "q44",
    question: "Which dynasty founded Cairo in 969 CE?",
    choices: ["Fatimids", "Ayyubids", "Mamluks", "Tulunids"],
    answer: 0
  },

  {
    id: "q45",
    question: "Which military leader founded the Ayyubid dynasty?",
    choices: ["Baybars", "Saladin", "Nur ad-Din", "Al-Kamil"],
    answer: 1
  },

  {
    id: "q46",
    question: "Saladin was born in which city?",
    choices: ["Damascus", "Tikrit", "Cairo", "Mosul"],
    answer: 1
  },

  {
    id: "q47",
    question: "Which Mamluk sultan defeated the Mongols at the Battle of Ain Jalut?",
    choices: ["Baybars", "Qutuz", "Al-Nasir Muhammad", "Aybak"],
    answer: 1
  },

  {
    id: "q48",
    question: "The Battle of Ain Jalut took place in which modern country?",
    choices: ["Jordan", "Israel", "Syria", "Lebanon"],
    answer: 1
  },

  {
    id: "q49",
    question: "Which Ottoman sultan conquered Constantinople in 1453?",
    choices: ["Suleiman I", "Mehmed II", "Selim I", "Bayezid I"],
    answer: 1
  },

  {
    id: "q50",
    question: "Which Ottoman sultan conquered Egypt and Syria in 1517?",
    choices: ["Mehmed II", "Selim I", "Suleiman I", "Murad IV"],
    answer: 1
  },

  {
    id: "q51",
    question: "Which Ottoman sultan is known as Suleiman the Magnificent?",
    choices: ["Suleiman I", "Suleiman II", "Selim II", "Mehmed III"],
    answer: 0
  },

  {
    id: "q52",
    question: "Which treaty formally ended the Ottoman Empire's First World War involvement?",
    choices: ["Treaty of Lausanne", "Treaty of Sèvres", "Treaty of Versailles", "Treaty of San Stefano"],
    answer: 1
  },

  {
    id: "q53",
    question: "Which treaty replaced the Treaty of Sèvres and internationally recognized modern Turkey's sovereignty?",
    choices: ["Treaty of Lausanne", "Treaty of Paris", "Treaty of Ankara", "Treaty of Mudros"],
    answer: 0
  },

  {
    id: "q54",
    question: "Which Ottoman institution was abolished in 1924 as part of Atatürk's reforms?",
    choices: ["Sultanate", "Caliphate", "Janissaries", "Grand Vizierate"],
    answer: 1
  },

  {
    id: "q55",
    question: "Which Ottoman military corps was abolished by Sultan Mahmud II in 1826?",
    choices: ["Janissaries", "Sipahis", "Mamluks", "Akıncı"],
    answer: 0
  },

  {
    id: "q56",
    question: "Which strait separates the European and Asian sides of Istanbul?",
    choices: ["Dardanelles", "Bosporus", "Kerch Strait", "Strait of Hormuz"],
    answer: 1
  },

  {
    id: "q57",
    question: "Which strait connects the Persian Gulf with the Gulf of Oman?",
    choices: ["Bab el-Mandeb", "Strait of Hormuz", "Dardanelles", "Bosporus"],
    answer: 1
  },

  {
    id: "q58",
    question: "Which strait connects the Red Sea with the Gulf of Aden?",
    choices: ["Bab el-Mandeb", "Strait of Hormuz", "Dardanelles", "Gibraltar"],
    answer: 0
  },

  {
    id: "q59",
    question: "Which is the largest island in the Mediterranean Sea?",
    choices: ["Cyprus", "Sicily", "Crete", "Sardinia"],
    answer: 1
  },

  {
    id: "q60",
    question: "Which river is generally considered the longest river in Western Asia?",
    choices: ["Euphrates", "Tigris", "Jordan", "Kura"],
    answer: 0
  },

  {
    id: "q61",
    question: "The Tigris and Euphrates rivers meet to form which waterway?",
    choices: ["Shatt al-Arab", "Orontes", "Litani", "Khabur"],
    answer: 0
  },

  {
    id: "q62",
    question: "Which river flows through Baghdad?",
    choices: ["Euphrates", "Tigris", "Jordan", "Orontes"],
    answer: 1
  },

  {
    id: "q63",
    question: "Which river flows through Damascus?",
    choices: ["Barada", "Tigris", "Euphrates", "Litani"],
    answer: 0
  },

  {
    id: "q64",
    question: "Which river is traditionally associated with the ancient city of Jericho?",
    choices: ["Jordan River", "Orontes River", "Litani River", "Yarmouk River"],
    answer: 0
  },

  {
    id: "q65",
    question: "Which country contains the majority of the ancient region of Mesopotamia?",
    choices: ["Iraq", "Jordan", "Lebanon", "Oman"],
    answer: 0
  },

  {
    id: "q66",
    question: "Which country has the highest peak in the Arabian Peninsula, Jabal An-Nabi Shu'ayb?",
    choices: ["Saudi Arabia", "Yemen", "Oman", "United Arab Emirates"],
    answer: 1
  },

  {
    id: "q67",
    question: "Jebel Hafeet is located primarily in which country?",
    choices: ["Qatar", "United Arab Emirates", "Bahrain", "Kuwait"],
    answer: 1
  },

  {
    id: "q68",
    question: "Which country is home to the Rub' al Khali, or Empty Quarter?",
    choices: ["Saudi Arabia", "Jordan", "Lebanon", "Bahrain"],
    answer: 0
  },

  {
    id: "q69",
    question: "Which desert extends across parts of Egypt, Libya, Sudan, and Chad?",
    choices: ["Gobi", "Sahara", "Arabian Desert", "Karakum"],
    answer: 1
  },

  {
    id: "q70",
    question: "Which country has the world's northernmost capital city among Arab capitals?",
    choices: ["Lebanon", "Tunisia", "Morocco", "Algeria"],
    answer: 2
  },

  {
    id: "q71",
    question: "Which Arab country is geographically located in both Africa and Asia?",
    choices: ["Egypt", "Libya", "Sudan", "Tunisia"],
    answer: 0
  },

  {
    id: "q72",
    question: "Which body of water separates Egypt's Sinai Peninsula from mainland Africa?",
    choices: ["Red Sea", "Mediterranean Sea", "Gulf of Suez", "Gulf of Aqaba"],
    answer: 2
  },

  {
    id: "q73",
    question: "Which gulf lies between the Sinai Peninsula and the Arabian Peninsula?",
    choices: ["Gulf of Aden", "Gulf of Aqaba", "Gulf of Oman", "Gulf of Suez"],
    answer: 1
  },

  {
    id: "q74",
    question: "Which country controls the Bab el-Mandeb's western shore?",
    choices: ["Yemen", "Djibouti", "Oman", "Saudi Arabia"],
    answer: 1
  },

  {
    id: "q75",
    question: "Which country is separated from Oman by the Musandam Peninsula?",
    choices: ["Qatar", "United Arab Emirates", "Bahrain", "Kuwait"],
    answer: 1
  },

  {
    id: "q76",
    question: "Which country contains the exclave of Madha?",
    choices: ["Saudi Arabia", "Oman", "United Arab Emirates", "Yemen"],
    answer: 1
  },

  {
    id: "q77",
    question: "Which country contains the counter-enclave of Nahwa?",
    choices: ["Oman", "United Arab Emirates", "Qatar", "Bahrain"],
    answer: 1
  },

  {
    id: "q78",
    question: "Which country is completely surrounded by South Africa?",
    choices: ["Eswatini", "Lesotho", "Botswana", "Zimbabwe"],
    answer: 1
  },

  {
    id: "q79",
    question: "Which country has the world's largest inland body of water, the Caspian Sea, on its coast?",
    choices: ["Iran", "Iraq", "Jordan", "Lebanon"],
    answer: 0
  },

  {
    id: "q80",
    question: "Which two countries share the island of Hispaniola?",
    choices: ["Cuba and Haiti", "Haiti and Dominican Republic", "Dominican Republic and Jamaica", "Haiti and Cuba"],
    answer: 1
  },

  {
    id: "q81",
    question: "Which country contains the world's highest uninterrupted waterfall, Angel Falls?",
    choices: ["Brazil", "Venezuela", "Colombia", "Peru"],
    answer: 1
  },

  {
    id: "q82",
    question: "Which mountain range traditionally forms part of the boundary between Europe and Asia?",
    choices: ["Alps", "Ural Mountains", "Carpathians", "Pyrenees"],
    answer: 1
  },

  {
    id: "q83",
    question: "Which country contains Mount Ararat?",
    choices: ["Iran", "Turkey", "Armenia", "Georgia"],
    answer: 1
  },

  {
    id: "q84",
    question: "Which country contains Mount Damavand, the highest peak in Iran?",
    choices: ["Iraq", "Iran", "Turkey", "Azerbaijan"],
    answer: 1
  },

  {
    id: "q85",
    question: "Which lake is the lowest point on Earth's land surface?",
    choices: ["Lake Baikal", "Dead Sea", "Lake Titicaca", "Lake Assal"],
    answer: 1
  },

  {
    id: "q86",
    question: "Lake Assal is located in which country?",
    choices: ["Eritrea", "Djibouti", "Somalia", "Ethiopia"],
    answer: 1
  },

  {
    id: "q87",
    question: "Which African country contains the ancient city of Aksum?",
    choices: ["Sudan", "Ethiopia", "Eritrea", "Somalia"],
    answer: 1
  },

  {
    id: "q88",
    question: "Which ancient kingdom was centered around the city of Meroë?",
    choices: ["Kush", "Axum", "Carthage", "Numidia"],
    answer: 0
  },

  {
    id: "q89",
    question: "Meroë was located in which modern country?",
    choices: ["Egypt", "Sudan", "Ethiopia", "Libya"],
    answer: 1
  },

  {
    id: "q90",
    question: "Which language family does Arabic belong to?",
    choices: ["Indo-European", "Semitic", "Turkic", "Dravidian"],
    answer: 1
  },

  {
    id: "q91",
    question: "Which language is generally considered the closest major living relative of Arabic?",
    choices: ["Hebrew", "Persian", "Turkish", "Kurdish"],
    answer: 0
  },

  {
    id: "q92",
    question: "Which Arabic letter is traditionally considered the first letter of the Arabic alphabet?",
    choices: ["ب", "ا", "م", "ل"],
    answer: 1
  },

  {
    id: "q93",
    question: "How many letters are traditionally counted in the Arabic alphabet?",
    choices: ["26", "27", "28", "29"],
    answer: 2
  },

  {
    id: "q94",
    question: "Which language uses an abjad system and is written from right to left?",
    choices: ["Arabic", "Greek", "Latin", "Georgian"],
    answer: 0
  },

  {
    id: "q95",
    question: "Which ancient language was widely used as a lingua franca across the Near East during the first millennium BCE?",
    choices: ["Aramaic", "Latin", "Greek", "Coptic"],
    answer: 0
  },

  {
    id: "q96",
    question: "Which language was the administrative language of the Achaemenid Persian Empire alongside other imperial languages?",
    choices: ["Elamite", "Old Persian", "Aramaic", "All of these"],
    answer: 3
  },

  {
    id: "q97",
    question: "Which modern language is written using the Arabic script but belongs to the Indo-European language family?",
    choices: ["Persian", "Hebrew", "Amharic", "Maltese"],
    answer: 0
  },

  {
    id: "q98",
    question: "Which modern language is the only Semitic language that is an official language of the European Union?",
    choices: ["Hebrew", "Maltese", "Arabic", "Amharic"],
    answer: 1
  },

  {
    id: "q99",
    question: "Which ancient language is the direct ancestor of modern Maltese?",
    choices: ["Classical Arabic", "Siculo-Arabic", "Phoenician", "Aramaic"],
    answer: 1
  },

  {
    id: "q100",
    question: "Which Arabic grammatical case indicates the direct object in Classical Arabic?",
    choices: ["Nominative", "Accusative", "Genitive", "Vocative"],
    answer: 1
  },

  {
    id: "q101",
    question: "Which scientist formulated the three laws of planetary motion?",
    choices: ["Galileo Galilei", "Johannes Kepler", "Isaac Newton", "Tycho Brahe"],
    answer: 1
  },

  {
    id: "q102",
    question: "Which scientist discovered the three fundamental laws of motion and universal gravitation?",
    choices: ["Newton", "Kepler", "Einstein", "Galileo"],
    answer: 0
  },

  {
    id: "q103",
    question: "What is the SI unit of electric capacitance?",
    choices: ["Ohm", "Farad", "Tesla", "Weber"],
    answer: 1
  },

  {
    id: "q104",
    question: "What is the SI unit of magnetic flux?",
    choices: ["Tesla", "Weber", "Henry", "Gauss"],
    answer: 1
  },

  {
    id: "q105",
    question: "What is the SI unit of inductance?",
    choices: ["Henry", "Farad", "Weber", "Ohm"],
    answer: 0
  },

  {
    id: "q106",
    question: "Which particle mediates the electromagnetic force?",
    choices: ["Gluon", "Photon", "W boson", "Graviton"],
    answer: 1
  },

  {
    id: "q107",
    question: "Which particles mediate the strong nuclear force?",
    choices: ["Photons", "Gluons", "Neutrinos", "Muons"],
    answer: 1
  },

  {
    id: "q108",
    question: "Which particle is electrically neutral and has an extremely small mass?",
    choices: ["Electron", "Proton", "Neutron", "Neutrino"],
    answer: 3
  },

  {
    id: "q109",
    question: "What is the approximate speed of light in a vacuum?",
    choices: ["300,000 km/s", "30,000 km/s", "3,000 km/s", "3,000,000 km/s"],
    answer: 0
  },

  {
    id: "q110",
    question: "Which element has the highest atomic number among naturally occurring elements?",
    choices: ["Uranium", "Thorium", "Plutonium", "Radium"],
    answer: 0
  },

  {
    id: "q111",
    question: "Which element has the chemical symbol W?",
    choices: ["Tungsten", "Tin", "Titanium", "Tantalum"],
    answer: 0
  },

  {
    id: "q112",
    question: "Which element has the chemical symbol Sb?",
    choices: ["Samarium", "Antimony", "Strontium", "Scandium"],
    answer: 1
  },

  {
    id: "q113",
    question: "Which element has the chemical symbol Hg?",
    choices: ["Hafnium", "Mercury", "Holmium", "Magnesium"],
    answer: 1
  },

  {
    id: "q114",
    question: "Which element has the atomic number 74?",
    choices: ["Tungsten", "Rhenium", "Osmium", "Hafnium"],
    answer: 0
  },

  {
    id: "q115",
    question: "Which element has the atomic number 79?",
    choices: ["Silver", "Platinum", "Gold", "Mercury"],
    answer: 2
  },

  {
    id: "q116",
    question: "What is the most abundant element in Earth's crust by mass?",
    choices: ["Silicon", "Oxygen", "Iron", "Aluminum"],
    answer: 1
  },

  {
    id: "q117",
    question: "What is the most abundant element in the universe?",
    choices: ["Helium", "Hydrogen", "Oxygen", "Carbon"],
    answer: 1
  },

  {
    id: "q118",
    question: "Which organelle is primarily responsible for ATP production in eukaryotic cells?",
    choices: ["Golgi apparatus", "Mitochondrion", "Lysosome", "Ribosome"],
    answer: 1
  },

  {
    id: "q119",
    question: "Which enzyme unwinds DNA during replication?",
    choices: ["DNA polymerase", "Helicase", "Ligase", "Primase"],
    answer: 1
  },

  {
    id: "q120",
    question: "Which enzyme joins Okazaki fragments together?",
    choices: ["DNA ligase", "Helicase", "Topoisomerase", "Primase"],
    answer: 0
  },

  {
    id: "q121",
    question: "Which molecule carries amino acids to the ribosome during protein synthesis?",
    choices: ["mRNA", "rRNA", "tRNA", "DNA"],
    answer: 2
  },

  {
    id: "q122",
    question: "Which nitrogenous base is found in RNA but not DNA?",
    choices: ["Thymine", "Uracil", "Cytosine", "Guanine"],
    answer: 1
  },

  {
    id: "q123",
    question: "Which blood type is considered the universal plasma donor?",
    choices: ["O negative", "AB", "A positive", "B negative"],
    answer: 1
  },

  {
    id: "q124",
    question: "Which cranial nerve is responsible for the sense of smell?",
    choices: ["Optic nerve", "Olfactory nerve", "Vagus nerve", "Trigeminal nerve"],
    answer: 1
  },

  {
    id: "q125",
    question: "Which part of the brain is primarily associated with balance and coordination?",
    choices: ["Cerebellum", "Medulla", "Hypothalamus", "Hippocampus"],
    answer: 0
  },

  {
    id: "q126",
    question: "Which structure connects the two cerebral hemispheres?",
    choices: ["Corpus callosum", "Medulla oblongata", "Thalamus", "Pons"],
    answer: 0
  },

  {
    id: "q127",
    question: "Which planet has the longest rotation period in the Solar System?",
    choices: ["Mercury", "Venus", "Mars", "Jupiter"],
    answer: 1
  },

  {
    id: "q128",
    question: "Which planet rotates in the opposite direction to most planets in the Solar System?",
    choices: ["Mars", "Venus", "Jupiter", "Neptune"],
    answer: 1
  },

  {
    id: "q129",
    question: "Which moon in the Solar System has a dense atmosphere primarily composed of nitrogen?",
    choices: ["Europa", "Titan", "Ganymede", "Callisto"],
    answer: 1
  },

  {
    id: "q130",
    question: "Which moon is the largest natural satellite in the Solar System?",
    choices: ["Titan", "Ganymede", "Callisto", "Triton"],
    answer: 1
  },

  {
    id: "q131",
    question: "Which dwarf planet lies in the asteroid belt between Mars and Jupiter?",
    choices: ["Pluto", "Ceres", "Eris", "Haumea"],
    answer: 1
  },

  {
    id: "q132",
    question: "Which star is closest to the Sun?",
    choices: ["Sirius", "Proxima Centauri", "Alpha Centauri A", "Betelgeuse"],
    answer: 1
  },

  {
    id: "q133",
    question: "What is the name of the supermassive black hole at the center of the Milky Way?",
    choices: ["Sagittarius A*", "Cygnus X-1", "Messier 87*", "Andromeda A*"],
    answer: 0
  },

  {
    id: "q134",
    question: "Which galaxy is expected to collide with the Milky Way in the distant future?",
    choices: ["Triangulum Galaxy", "Andromeda Galaxy", "Whirlpool Galaxy", "Sombrero Galaxy"],
    answer: 1
  },

  {
    id: "q135",
    question: "Which type of galaxy is the Milky Way?",
    choices: ["Elliptical", "Spiral", "Irregular", "Lenticular"],
    answer: 1
  },

  {
    id: "q136",
    question: "Who wrote 'The Brothers Karamazov'?",
    choices: ["Leo Tolstoy", "Fyodor Dostoevsky", "Anton Chekhov", "Ivan Turgenev"],
    answer: 1
  },

  {
    id: "q137",
    question: "Who wrote 'One Hundred Years of Solitude'?",
    choices: ["Gabriel García Márquez", "Jorge Luis Borges", "Pablo Neruda", "Mario Vargas Llosa"],
    answer: 0
  },

  {
    id: "q138",
    question: "Which poet wrote the Persian epic 'Shahnameh'?",
    choices: ["Rumi", "Ferdowsi", "Hafez", "Omar Khayyam"],
    answer: 1
  },

  {
    id: "q139",
    question: "Which Persian poet wrote the 'Masnavi'?",
    choices: ["Rumi", "Ferdowsi", "Hafez", "Saadi"],
    answer: 0
  },

  {
    id: "q140",
    question: "Which famous Persian poet wrote the 'Rubaiyat'?",
    choices: ["Rumi", "Omar Khayyam", "Ferdowsi", "Saadi"],
    answer: 1
  },

  {
    id: "q141",
    question: "Which Arabic literary work is a famous collection of Middle Eastern folktales including the story of Aladdin?",
    choices: ["One Thousand and One Nights", "Mu'allaqat", "Kalila wa Dimna", "The Book of Kings"],
    answer: 0
  },

  {
    id: "q142",
    question: "Which Roman author wrote 'The Aeneid'?",
    choices: ["Ovid", "Virgil", "Cicero", "Livy"],
    answer: 1
  },

  {
    id: "q143",
    question: "Which Greek historian is often called the 'Father of History'?",
    choices: ["Thucydides", "Herodotus", "Xenophon", "Polybius"],
    answer: 1
  },

  {
    id: "q144",
    question: "Which historian wrote 'The History of the Peloponnesian War'?",
    choices: ["Herodotus", "Thucydides", "Plutarch", "Xenophon"],
    answer: 1
  },

  {
    id: "q145",
    question: "Which civilization created the Antikythera mechanism?",
    choices: ["Romans", "Greeks", "Egyptians", "Phoenicians"],
    answer: 1
  },

  {
    id: "q146",
    question: "The Antikythera mechanism is generally considered an ancient device for calculating what?",
    choices: ["Earthquakes", "Astronomical cycles", "Ocean tides only", "Currency exchange"],
    answer: 1
  },

  {
    id: "q147",
    question: "Which mathematical constant is approximately equal to 1.6180339887?",
    choices: ["Euler's number", "Golden ratio", "Pi", "Square root of 2"],
    answer: 1
  },

  {
    id: "q148",
    question: "Which mathematician is associated with the theorem a² + b² = c²?",
    choices: ["Euclid", "Pythagoras", "Archimedes", "Apollonius"],
    answer: 1
  },

  {
    id: "q149",
    question: "Which mathematician is associated with the principle describing buoyancy?",
    choices: ["Archimedes", "Euclid", "Pythagoras", "Eratosthenes"],
    answer: 0
  },

  {
    id: "q150",
    question: "Which ancient Greek scholar calculated Earth's circumference with remarkable accuracy using geometry and shadows?",
    choices: ["Eratosthenes", "Euclid", "Archimedes", "Ptolemy"],
    answer: 0
  }

];


/* ==========================================
   CONFIG
========================================== */

const QUESTION_TIME =
  15;


/* ==========================================
   HANDLER
========================================== */

export default async function handler(
  req,
  res
) {

  if (setCors(req, res)) {
    return;
  }


  if (req.method !== "POST") {

    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });

  }


  try {

    const user =
      await getAuthenticatedUser(req);


    if (!user) {

      return res.status(401).json({
        success: false,
        authenticated: false,
        error: "Not authenticated"
      });

    }


    const db =
      await getDb();


    /*
      Make sure the player has a
      minigame account.
    */

    const minigameUser =
      await db
        .collection("minigame_users")
        .findOne({
          _id: user._id
        });


    if (!minigameUser) {

      return res.status(404).json({
        success: false,
        error: "Minigame account not found"
      });

    }


    /*
      Pick a random question.
    */

    const index =
      crypto.randomInt(
        0,
        QUESTIONS.length
      );

    const question =
      QUESTIONS[index];


    /*
      Create a unique round ID.
    */

    const roundId =
      crypto.randomBytes(24)
        .toString("hex");


    const now =
      new Date();

    const expiresAt =
      new Date(
        now.getTime() +
        QUESTION_TIME * 1000
      );


    /*
      Store the round server-side.

      IMPORTANT:
      The correct answer is stored
      here but NEVER returned to
      the browser.
    */

    await db
      .collection("trivia_games")
      .insertOne({

        _id: roundId,

        userId:
          user._id,

        questionId:
          question.id,

        correctAnswer:
          question.answer,

        choices:
          question.choices,

        status:
          "active",

        streak:
          minigameUser.triviaStreak || 0,

        createdAt:
          now,

        expiresAt,

        answeredAt:
          null,

        result:
          null,

        reward:
          0
      });


    /*
      Only return safe information.
    */

    return res.status(200).json({

      success: true,

      game: "trivia",

      roundId,

      question: {
        text:
          question.question,

        choices:
          question.choices
      },

      expiresAt:
        expiresAt.toISOString(),

      timeLimit:
        QUESTION_TIME,

      streak:
        minigameUser.triviaStreak || 0

    });

  } catch (error) {

    console.error(
      "TRIVIA QUESTION ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });

  }
}
