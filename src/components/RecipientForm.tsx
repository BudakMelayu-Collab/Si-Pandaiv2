import React, { useState, useEffect, useRef } from "react";
import {
  Save,
  X,
  Upload,
  FileText,
  Image as ImageIcon,
  DollarSign,
  Plus,
  Trash2,
  Layers,
  Edit3,
  Check,
  Eye,
  ChevronRight,
  Loader2,
  QrCode,
  Smartphone,
  Wand2,
  Printer,
  Copy,
  Stethoscope,
  FileCheck,
  CreditCard,
  MapPin,
  Calendar,
  Phone,
  Map,
  Hash,
  Building,
  User,
  BookOpen,
  Search,
  Download,
  IdCard,
  MapPinned,
  FolderCheck,
} from "lucide-react";
import {
  SIAK_REGIONAL_DATA,
  SIAK_SECTORS,
  SIAK_AID_TYPES,
  SIAK_PROGRAM_NAMES,
  SIAK_COMPANIONS,
  DOCUMENT_OPTIONS,
  getDefaultDocuments
} from "../constants";
import { cn } from "../lib/utils";
import { AidDocument, Recipient } from "../types";
import {
  getGoogleAccessToken,
  setGoogleAccessToken,
  uploadFileToGoogleDrive,
  downloadGoogleDriveFileAsBase64,
  fetchSharedGoogleAccessToken,
  auth,
} from "../firebase";

interface RecipientFormProps {
  onSubmit: (data: any) => void | Promise<void>;
  onCancel: () => void;
  existingRecipients?: Recipient[];
  initialGroupRecipients?: Recipient[];
  initialStep?: number;
  isPublic?: boolean;
  onReceipt?: (recipient: Recipient) => void;
  onMassReceipt?: (recipients: Recipient[]) => void;
  onMassSurvey?: (recipients: Recipient[]) => void;
  onMassMPZIS?: (recipients: Recipient[]) => void;
  onMassEPPD?: (recipients: Recipient[]) => void;
}

interface DocumentSlot {
  label: string;
  file?: {
    name: string;
    type: "image" | "pdf" | "excel";
    url: string; // base64 representation
    size?: string;
  };
  isCustomLabel?: boolean;
}

const INITIAL_DOCUMENT_SLOTS: DocumentSlot[] = [
  { label: "Berkas Persyaratan" },
];

const toTitleCase = (str: string) => {
  return str.replace(/\w\S*/g, function(txt){
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
};

const extractNIK = (nik: string) => {
  if (nik.length !== 16) return null;
  const dateStr = nik.substring(6, 8);
  const monthStr = nik.substring(8, 10);
  const yearStr = nik.substring(10, 12);
  
  let date = parseInt(dateStr, 10);
  let gender = "Laki-laki";
  
  if (date > 40) {
    gender = "Perempuan";
    date -= 40;
  }
  
  let year = parseInt(yearStr, 10);
  const currentYear = new Date().getFullYear() % 100;
  year += (year > currentYear ? 1900 : 2000);
  
  const formattedDate = date.toString().padStart(2, '0');
  const dob = `${formattedDate}/${monthStr}/${year}`;
  
  return { gender, dob };
};

const DEFAULT_RECIPIENT_INPUT = {
  name: "",
  nik: "",
  kk: "",
  pob: "",
  dob: "",
  gender: "Laki-laki",
  familyStatus: "",
  headOfFamilyName: "",
  headOfFamilyDob: "",
  contact: "",
  address: "",
  rt: "",
  rw: "",
  kampung: "",
  district: "",
  schoolName: "",
  schoolLevel: "",
  schoolClass: "",
  schoolAddress: "",
  schoolPhone: "",
  bankAccountNo: "",
  bankName: "",
  bankAccountHolder: "",
  purpose: "", // Tujuan Penyaluran
  tujuanPengajuan: "", // Tujuan Pengajuan
  notes: "",
  documentStatus: "Lengkap",
  documentStatusNotes: "",
  job: "",
  physicalCondition: "Sehat" as "Sehat" | "Sakit" | "Cacat",
  treatmentStart: "",
  diagnosis: "",
  hospitalName: "",
  patientCompanionName: "",
  isReceiptGenerated: true,
  isSurveyGenerated: true,
  isMPZISGenerated: true,
  isEPPDGenerated: true,
};

const BUDGET_OPTIONS = [
  { code: "5,2,01", name: "Penyaluran/Infaq/InfaqTerikat" },
  { code: "5,2,02", name: "Penyaluran/Infaq/Infaq Tidak Terikat" },
  { code: "5.1.02.03.02.01", name: "Penyaluran zakat maal asnaf miskin Program Siak Sehat Bantuan Biaya Transportasi Pasien" },
  { code: "5.1.02.03.02.02", name: "Penyaluran zakat maal asnaf miskin Program Siak Sehat Bantuan Biaya Pendamping Pasien" },
  { code: "5.1.02.03.03.01", name: "Penyaluran zakat maal asnaf miskin Program Siak Sejahtera Produktif Zchicken" },
  { code: "5.1.02.03.03.02", name: "Penyaluran zakat maal asnaf miskin Program Siak Sejahtera Produktif Zauto" },
  { code: "5.1.02.03.03.03", name: "Penyaluran zakat maal asnaf miskin Program Siak Sejahtera Produktif Zmart" },
  { code: "5.1.02.03.03.04", name: "Penyaluran zakat maal asnaf miskin Program Siak Sejahtera Produktif Lumbung Pangan" },
  { code: "5.1.02.03.03.05", name: "Penyaluran zakat maal asnaf miskin Program Siak Sejahtera Produktif Ternak/Balai Ternak" },
  { code: "5.1.02.03.03.06", name: "Penyaluran zakat maal asnaf miskin Program Siak Sejahtera Produktif Santripreneur" },
  { code: "5.1.02.03.03.07", name: "Penyaluran zakat maal asnaf miskin Program Siak Sejahtera Produktif Terunapreneur" },
  { code: "5.1.02.03.03.08", name: "Penyaluran zakat maal asnaf miskin Program Siak Sejahtera Produktif Zkuliner" },
  { code: "5.1.02.03.03.09", name: "Penyaluran zakat maal asnaf miskin Program Siak Sejahtera Produktif MIKO" },
  { code: "5.1.02.03.03.10", name: "Penyaluran zakat maal asnaf miskin Program Siak Sejahtera Produktif Micropreneur Mandiri" },
  { code: "5.1.02.03.03.11", name: "Penyaluran zakat maal asnaf miskin Program Siak Sejahtera Produktif Kemitraan" },
  { code: "5.1.02.03.03.12", name: "Penyaluran zakat maal asnaf miskin Program Siak Sejahtera Produktif BAZNAS Microfinance" },
  { code: "5.1.02.07.03.01", name: "Penyaluran zakat maal asnaf fisabilillah Program Siak Sejahtera Produktif Zchicken" },
  { code: "5.1.02.07.03.02", name: "Penyaluran zakat maal asnaf fisabilillah Program Siak Sejahtera Produktif Zauto" },
  { code: "5.1.02.07.03.03", name: "Penyaluran zakat maal asnaf fisabilillah Program Siak Sejahtera Produktif Zmart" },
  { code: "5.1.02.07.03.04", name: "Penyaluran zakat maal asnaf fisabilillah Program Siak Sejahtera Produktif Lumbung Pangan" },
  { code: "5.1.02.07.03.05", name: "Penyaluran zakat maal asnaf fisabilillah Program Siak Sejahtera Produktif Ternak/Balai Ternak" },
  { code: "5.1.02.07.03.06", name: "Penyaluran zakat maal asnaf fisabilillah Program Siak Sejahtera Produktif Santripreneur" },
  { code: "5.1.02.07.03.07", name: "Penyaluran zakat maal asnaf fisabilillah Program Siak Sejahtera Produktif Terunapreneur" },
  { code: "5.1.02.07.03.08", name: "Penyaluran zakat maal asnaf fisabilillah Program Siak Sejahtera Produktif Zkuliner" },
  { code: "5.1.02.07.03.09", name: "Penyaluran zakat maal asnaf fisabilillah Program Siak Sejahtera Produktif MIKO" },
  { code: "5.1.02.07.03.10", name: "Penyaluran zakat maal asnaf fisabilillah Program Siak Sejahtera Produktif Micropreneur Mandiri" },
  { code: "5.1.02.07.03.11", name: "Penyaluran zakat maal asnaf fisabilillah Program Siak Sejahtera Produktif Kemitraan" },
  { code: "5.1.02.07.03.12", name: "Penyaluran zakat maal asnaf fisabilillah Program Siak Sejahtera Produktif BAZNAS Microfinance" },
  { code: "5.1.02.07.03.13", name: "Penyaluran zakat maal asnaf fisabilillah Program Siak Sejahtera Produktif Program Penguatan Ekonomi Pondok Pesantren" },
  { code: "5.1.02.07.03.99", name: "Penyaluran zakat maal asnaf fisabilillah Program Siak Sejahtera Dana Assesment, Asistensi dan Monev" },
  { code: "5.1.02.07.05.01", name: "Penyaluran zakat maal Asnaf Fisabillah Program Siak Cerdas Bantuan Biaya Pendidikan Santri" },
  { code: "5.1.02.07.05.02", name: "Penyaluran zakat maal Asnaf Fisabillah Program Siak Cerdas Bantuan Biaya Pendidikan Dasar" },
  { code: "5.1.02.07.05.03", name: "Penyaluran zakat maal Asnaf Fisabillah Program Siak Cerdas Bantuan Santri Binaan BAZNAS Siak" },
  { code: "5.1.02.07.05.04", name: "Penyaluran zakat maal Asnaf Fisabillah Program Siak Cerdas Program Satu Keluarga Satu Sarjana (SKSS)" },
  { code: "5.1.02.07.05.05", name: "Penyaluran zakat maal Asnaf Fisabillah Program Siak Cerdas Program Beasiswa Cendikia BAZNAS (BCB)" },
  { code: "5.1.02.07.05.06", name: "Penyaluran zakat maal Asnaf Fisabillah Program Siak Cerdas Bantuan Beasiswa Riset BAZNAS" },
  { code: "5.1.02.07.05.07", name: "Penyaluran zakat maal Asnaf Fisabillah Program Siak Cerdas Program Bantuan Seragam Sekolah" },
  { code: "5.1.02.07.05.08", name: "Penyaluran zakat maal Asnaf Fisabillah Program Siak Cerdas Program Santunan Tenaga Pendidik" },
  { code: "5.1.02.07.05.09", name: "Penyaluran zakat maal Asnaf Fisabillah Program Siak Cerdas Program Beasiswa Santri Yatim Dhuafa" },
  { code: "5.1.02.07.05.10", name: "Penyaluran zakat maal Asnaf Fisabillah Program Siak Cerdas Bantuan Beasiswa Disabilitas, 3T dan KAT" },
  { code: "5.1.02.07.05.99", name: "Penyaluran zakat maal Asnaf Fisabillah Program Siak Cerdas Biaya Assesment, Asistensi dan Monev Program Siak Cerdas" },
];

const PERSON_IN_CHARGE_OPTIONS = [
  "Andreas Supriadi",
  "Satriyanda",
  "Muslikun Thohari",
  "Anshori",
  "M. Sanusi Bernawa",
  "Ikhlasul Amal",
  "Dina Alvinda",
  "Syarifah Suci Merza",
];

const JOB_OPTIONS = [
  "Buruh Harian Lepas",
  "Bekerja",
  "Petani",
  "Beternak",
  "Berdagang",
  "Pedagang_Kaki_Lima",
  "Karyawan PT",
  "Karyawan Kontrak",
  "Karyawan Kebun",
  "Sopir",
  "Cerai Hidup",
  "Cerai Mati",
  "Pemanen",
  "Lansia",
  "Tidak Bekerja",
  "Belum Bekerja",
  "Menganggur",
  "Tidak Bekerja (Sakit)",
  "Meninggal",
  "Tidak Sanggup Bekerja",
  "Karyawan Honorer",
  "PNS",
  "Guru",
  "Pensiunan"
];

export default function RecipientForm({
  onSubmit,
  onCancel,
  existingRecipients,
  initialGroupRecipients,
  initialStep,
  isPublic = false,
  onReceipt,
  onMassReceipt,
  onMassSurvey,
  onMassMPZIS,
  onMassEPPD,
}: RecipientFormProps) {
  const generateRegId = () =>
    `REG-${Math.floor(100000 + Math.random() * 900000)}`;

  const DEFAULT_REGISTRATION_DATA = {
    registrationId: generateRegId(),
    adminCategory: "",
    serviceType: "",
    source: "",
    ashnaf: "",
    institutionName: "",
    personInCharge: "",
    submissionDate: new Date().toISOString().split("T")[0],
    companion: "",
    sector: "",
    subSector: "",
    aidType: "",
    programName: "",
    amountProposed: "",
    fundingSource: "",
    notes: "",
    isTermsAccepted: true,
    status: "Masuk Berkas",
    documents: [],
    tujuanPengajuan: "",
    tujuanPenyaluranMPZIS: "",
    budgetCode: "",
    budgetName: "",
    transactionType: "",
  };

  // Main Registration Data State (Tabel Utama)
  const [registrationData, setRegistrationData] = useState(DEFAULT_REGISTRATION_DATA);

  // Current Recipient Input State
  const [recipientInput, setRecipientInput] = useState(DEFAULT_RECIPIENT_INPUT);

  // List of added Recipients in sub-table
  const [subRecipients, setSubRecipients] = useState<any[]>([]);

  // List of completed registration groups for Mass Entry
  const [savedGroups, setSavedGroups] = useState<{registrationData: any, subRecipients: any[], printGroup: boolean}[]>([]);

  // Editing state for sub-table recipient
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const [isAddingToSub, setIsAddingToSub] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);

  // Step for Wizard UI
  const [currentStep, setCurrentStep] = useState(initialStep || 1);
  const [searchQuery, setSearchQuery] = useState("");
  const excelFileInputRef = React.useRef<HTMLInputElement>(null);

  // Set step if initialStep changes
  useEffect(() => {
    if (initialStep) {
      setCurrentStep(initialStep);
    }
  }, [initialStep]);

  // Hospital options
  const [hospitalOptions, setHospitalOptions] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("hospitalOptions");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return ["RSUD Tengku Rafi'an Siak"];
  });

  const handleAddHospital = (val: string) => {
    const trimmed = val.trim();
    if (trimmed && !hospitalOptions.includes(trimmed)) {
      setHospitalOptions(prev => {
        const newOptions = [...prev, trimmed];
        localStorage.setItem("hospitalOptions", JSON.stringify(newOptions));
        return newOptions;
      });
    }
  };

  // Disease options
  const [diseaseOptions, setDiseaseOptions] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("diseaseOptions");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return ["Demam Berdarah", "Tipes", "Infeksi Saluran Pernapasan"];
  });

  const handleAddDisease = (val: string) => {
    const trimmed = val.trim();
    if (trimmed && !diseaseOptions.includes(trimmed)) {
      setDiseaseOptions(prev => {
        const newOptions = [...prev, trimmed];
        localStorage.setItem("diseaseOptions", JSON.stringify(newOptions));
        return newOptions;
      });
    }
  };

  // Google Drive Integration States
  const [saveToGDrive, setSaveToGDrive] = useState<boolean>(() => {
    return localStorage.getItem("ppd_save_gdrive") !== "false";
  });
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [gdriveBase64Data, setGdriveBase64Data] = useState<string | null>(null);

  const handleToggleGDrive = (val: boolean) => {
    if (val && !getGoogleAccessToken()) {
      alert("Silakan hubungkan Google Drive Pribadi di menu Pengaturan terlebih dahulu.");
    } else {
      setSaveToGDrive(val);
      localStorage.setItem("ppd_save_gdrive", val ? "true" : "false");
    }
  };

  // Local states for 15 slots document upload
  const [documentSlots, setDocumentSlots] = useState<DocumentSlot[]>(() =>
    INITIAL_DOCUMENT_SLOTS.map((s) => ({ ...s })),
  );
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{
    name: string;
    url: string;
  } | null>(null);
  const [mergingIdx, setMergingIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setActiveSlotIndex(idx);
      const file = e.dataTransfer.files[0];
      await processSelectedFile(file, idx);
    }
  };

  // States for adding custom dropdown options
  const [customSubSectors, setCustomSubSectors] = useState<
    Record<string, string[]>
  >({});
  const [customAidTypes, setCustomAidTypes] = useState<
    Record<string, string[]>
  >({});
  const [customProgramNames, setCustomProgramNames] = useState<
    Record<string, string[]>
  >({});
  const [customCompanions, setCustomCompanions] = useState<string[]>([]);
  const [customPersonInCharge, setCustomPersonInCharge] = useState<string[]>(
    [],
  );

  useEffect(() => {
    const fetchToken = async () => {
      const token = await fetchSharedGoogleAccessToken();
    };
    fetchToken();
  }, []);

  useEffect(() => {
    if (initialGroupRecipients && initialGroupRecipients.length > 0) {
      const first = initialGroupRecipients[0];
      if (!first) return;
      setRegistrationData({
        registrationId: first.registrationId || generateRegId(),
        adminCategory: first.adminCategory || "",
        serviceType: first.serviceType || "",
        source: first.source || "",
        ashnaf: first.ashnaf || "",
        institutionName: first.institutionName || "",
        personInCharge: first.personInCharge || "",
        submissionDate:
          first.submissionDate || new Date().toISOString().split("T")[0],
        companion: first.companion || "",
        sector: first.sector || "",
        subSector: first.subSector || "",
        aidType: first.aidType || "",
        programName: first.programName || "",
        amountProposed: first.amountProposed || "",
        fundingSource: first.fundingSource || "",
        notes: first.notes || "",
        isTermsAccepted: true,
        status: first.status || "Masuk Berkas",
        documents: [],
        tujuanPengajuan: first.tujuanPengajuan || "",
        tujuanPenyaluranMPZIS: first.tujuanPenyaluranMPZIS || "",
        budgetCode: first.budgetCode || "",
        budgetName: first.budgetName || "",
        transactionType: first.transactionType || "",
      });
      setSubRecipients(initialGroupRecipients || []);
    }
  }, [initialGroupRecipients]);

  useEffect(() => {
    if (!initialGroupRecipients || initialGroupRecipients.length === 0) {
      try {
        const draftStr = localStorage.getItem("recipient_form_draft");
        if (draftStr) {
          const draft = JSON.parse(draftStr);
          if (draft.registrationData) {
            setRegistrationData((prev) => ({
              ...prev,
              ...draft.registrationData,
              registrationId: prev.registrationId,
            }));
          }
          if (draft.subRecipients) {
            setSubRecipients(draft.subRecipients);
          }
          if (draft.recipientInput) {
            setRecipientInput({ ...DEFAULT_RECIPIENT_INPUT, ...draft.recipientInput });
          }
          if (draft.currentStep) {
            setCurrentStep(draft.currentStep);
          }
          if (draft.savedGroups) {
            setSavedGroups(draft.savedGroups);
          }
        }
      } catch (err) {
        console.error("Failed to load draft:", err);
      }
    }
  }, []);

  useEffect(() => {
    if (!initialGroupRecipients || initialGroupRecipients.length === 0) {
      const saveDraft = () => {
        try {
          // exclude heavy base64 documents from drafting if we want to be safe,
          const safeSubRecipients = subRecipients.map((sub) => ({
            ...sub,
            documents: sub.documents?.map((d: any) => ({
              ...d,
              url: d.url?.startsWith("data:") ? "" : d.url,
            })),
          }));

          const draft = {
            registrationData,
            subRecipients: safeSubRecipients,
            recipientInput,
            currentStep,
            savedGroups,
          };
          localStorage.setItem("recipient_form_draft", JSON.stringify(draft));
        } catch (err) {
          console.warn("Failed to save draft (might be too large):", err);
        }
      };

      const timeout = setTimeout(saveDraft, 1000);
      return () => clearTimeout(timeout);
    }
  }, [
    registrationData,
    subRecipients,
    recipientInput,
    currentStep,
    savedGroups,
    initialGroupRecipients,
  ]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (subRecipients.length > 0 || savedGroups.length > 0 || currentStep > 1) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [subRecipients.length, savedGroups.length, currentStep]);

  useEffect(() => {
    if (!existingRecipients) return;

    // Auto-discover unique custom parameters historically to prepopulate dropdowns
    const newCustomSubs = { ...customSubSectors };
    const newCustomAid = { ...customAidTypes };
    const newCustomProg = { ...customProgramNames };
    const newCustomCompanions = [...customCompanions];
    const newCustomPersonInCharge = [...customPersonInCharge];
    let hasChanges = false;

    existingRecipients.forEach((r) => {
      const sec = r.sector;

      if (r.companion && r.companion !== "-") {
        if (
          !SIAK_COMPANIONS.includes(r.companion) &&
          !newCustomCompanions.includes(r.companion)
        ) {
          newCustomCompanions.push(r.companion);
          hasChanges = true;
        }
      }

      if (r.personInCharge && r.personInCharge !== "-") {
        if (
          !PERSON_IN_CHARGE_OPTIONS.includes(r.personInCharge) &&
          !newCustomPersonInCharge.includes(r.personInCharge)
        ) {
          newCustomPersonInCharge.push(r.personInCharge);
          hasChanges = true;
        }
      }

      if (!sec) return;

      if (r.subSector && r.subSector !== "-") {
        if (!(SIAK_SECTORS[sec] || []).includes(r.subSector)) {
          if (!newCustomSubs[sec]) newCustomSubs[sec] = [];
          if (!newCustomSubs[sec].includes(r.subSector)) {
            newCustomSubs[sec].push(r.subSector);
            hasChanges = true;
          }
        }
      }
      if (r.aidType && (r.aidType as string) !== "-") {
        if (!(SIAK_AID_TYPES[sec] || []).includes(r.aidType as string)) {
          if (!newCustomAid[sec]) newCustomAid[sec] = [];
          if (!newCustomAid[sec].includes(r.aidType as string)) {
            newCustomAid[sec].push(r.aidType as string);
            hasChanges = true;
          }
        }
      }
      if (r.programName && r.programName !== "-") {
        if (!(SIAK_PROGRAM_NAMES[sec] || []).includes(r.programName)) {
          if (!newCustomProg[sec]) newCustomProg[sec] = [];
          if (!newCustomProg[sec].includes(r.programName)) {
            newCustomProg[sec].push(r.programName);
            hasChanges = true;
          }
        }
      }
    });

    if (hasChanges) {
      setCustomSubSectors(newCustomSubs);
      setCustomAidTypes(newCustomAid);
      setCustomProgramNames(newCustomProg);
      setCustomCompanions(newCustomCompanions);
      setCustomPersonInCharge(newCustomPersonInCharge);
    }
  }, [existingRecipients]);

  const [isAddingSubSector, setIsAddingSubSector] = useState(false);
  const [newSubSectorVal, setNewSubSectorVal] = useState("");

  const [isAddingAidType, setIsAddingAidType] = useState(false);
  const [newAidTypeVal, setNewAidTypeVal] = useState("");

  const [isAddingProgramName, setIsAddingProgramName] = useState(false);
  const [newProgramNameVal, setNewProgramNameVal] = useState("");

  const [isAddingCompanion, setIsAddingCompanion] = useState(false);
  const [newCompanionVal, setNewCompanionVal] = useState("");

  const [isAddingPersonInCharge, setIsAddingPersonInCharge] = useState(false);
  const [newPersonInChargeVal, setNewPersonInChargeVal] = useState("");

  const handleAdminCategoryChange = (val: string) => {
    let nextState = { ...registrationData, adminCategory: val };

    if (val === "Bantuan Sosial/Mustahik") {
      nextState.serviceType = "";
      nextState.source = "";
      nextState.sector = "";
      nextState.programName = "";
      nextState.aidType = "";
    } else if (val === "Honorarium Pendamping") {
      nextState.serviceType = "Assesment, Asistensi, dan Monev";
      nextState.source = "Internal";
      nextState.sector = "Siak Sejahtera";
      nextState.programName = "Honor Pendamping Program";
      nextState.aidType = "Dana Operasional Program";

      // Auto-add to custom state if not present
      if (
        !SIAK_AID_TYPES["Siak Sejahtera"]?.includes("Dana Operasional Program")
      ) {
        setCustomAidTypes((prev) => {
          const list = prev["Siak Sejahtera"] || [];
          if (!list.includes("Dana Operasional Program")) {
            return {
              ...prev,
              ["Siak Sejahtera"]: [...list, "Dana Operasional Program"],
            };
          }
          return prev;
        });
      }

      if (
        !SIAK_PROGRAM_NAMES["Siak Sejahtera"]?.includes(
          "Honor Pendamping Program",
        )
      ) {
        setCustomProgramNames((prev) => {
          const list = prev["Siak Sejahtera"] || [];
          if (!list.includes("Honor Pendamping Program")) {
            return {
              ...prev,
              ["Siak Sejahtera"]: [...list, "Honor Pendamping Program"],
            };
          }
          return prev;
        });
      }
    } else {
      nextState.serviceType = "";
      nextState.source = "";
      nextState.sector = "";
      nextState.programName = "";
      nextState.aidType = "";
    }

    setRegistrationData(nextState);
  };

  const handleServiceTypeChange = (val: string) => {
    let nextState = { ...registrationData, serviceType: val };
    if (val === "Program Bulanan") {
      if (
        !["Siak Cerdas", "Siak Dakwah", "Siak Peduli"].includes(
          nextState.sector,
        )
      ) {
        nextState.sector = "";
        nextState.programName = "";
        nextState.aidType = "";
      }
    }
    setRegistrationData(nextState);
  };

  const handleProgramNameChange = (val: string) => {
    let nextState = { ...registrationData, programName: val };

    if (val === "Beasiswa SKSS BAZNAS Siak") {
      nextState.aidType = "Beasiswa Pendidikan (Rutin Berkala)";
    } else if (val === "Satu Keluarga Satu Sarjana (SKSS)") {
      nextState.aidType = "Pembinaan & Biaya Hidup Mahasiswa";
    } else if (
      [
        "Beasiswa Santri Tingkat (MI, MTs dan MA)",
        "Beasiswa Cendikia BAZNAS Jenjang S1",
        "Beasiswa Cendikia BAZNAS Jenjang D3-D4",
        "Beasiswa Tahfidz Qur'an 1-5 Juz",
        "Beasiswa Riset BAZNAS S1",
        "Beasiswa Disabilitas, 3T dan KAT",
      ].includes(val)
    ) {
      nextState.aidType = "Beasiswa Pendidikan (Sekali Bayar / Insidental)";
    } else if (
      [
        "Bantuan Biaya Pendidikan",
        "Bantuan Pendidikan",
        "Bantuan Pendidikan Infak Terikat",
      ].includes(val)
    ) {
      nextState.aidType = "Bantuan Biaya Pendidikan (Insidental / Tunggakan)";
    } else if (
      [
        "Seragam Sekolah Tingkat SD",
        "Seragam Sekolah Tingkat SMP",
        "Seragam Sekolah Tingkat (MI, MTs dan MA)",
      ].includes(val)
    ) {
      nextState.aidType = "Bantuan Perlengkapan & Sarana Belajar";
    } else if (
      [
        "Santri Binaan (Ponpes Darul Hadist)",
        "Santri Binaan (SMP Cendikia)",
        "Santri Binaan (Abdur Rahman) di Darul Hadist Siak",
      ].includes(val)
    ) {
      nextState.aidType = "Pembinaan & Biaya Hidup Santri";
    } else if (["Santunan Guru Madrasah Aliyah (MA)"].includes(val)) {
      nextState.aidType = "Santunan & Insentif Guru (Pendidik)";
    }

    setRegistrationData(nextState);
  };

  const handleAddSubSector = () => {
    const trimmed = newSubSectorVal.trim();
    if (!trimmed || !registrationData.sector) return;
    setCustomSubSectors((prev) => {
      const list = prev[registrationData.sector] || [];
      if (list.includes(trimmed)) return prev;
      return { ...prev, [registrationData.sector]: [...list, trimmed] };
    });
    setRegistrationData((prev) => ({ ...prev, subSector: trimmed }));
    setIsAddingSubSector(false);
    setNewSubSectorVal("");
  };

  const handleAddAidType = () => {
    const trimmed = newAidTypeVal.trim();
    if (!trimmed || !registrationData.sector) return;
    setCustomAidTypes((prev) => {
      const list = prev[registrationData.sector] || [];
      if (list.includes(trimmed)) return prev;
      return { ...prev, [registrationData.sector]: [...list, trimmed] };
    });
    setRegistrationData((prev) => ({ ...prev, aidType: trimmed }));
    setIsAddingAidType(false);
    setNewAidTypeVal("");
  };

  const handleAddProgramName = () => {
    const trimmed = newProgramNameVal.trim();
    if (!trimmed || !registrationData.sector) return;
    setCustomProgramNames((prev) => {
      const list = prev[registrationData.sector] || [];
      if (list.includes(trimmed)) return prev;
      return { ...prev, [registrationData.sector]: [...list, trimmed] };
    });
    setRegistrationData((prev) => ({ ...prev, programName: trimmed }));
    setIsAddingProgramName(false);
    setNewProgramNameVal("");
  };

  const handleAddCompanion = () => {
    const trimmed = newCompanionVal.trim();
    if (!trimmed) return;
    setCustomCompanions((prev) => {
      if (prev.includes(trimmed)) return prev;
      return [...prev, trimmed];
    });
    setRegistrationData((prev) => ({ ...prev, companion: trimmed }));
    setIsAddingCompanion(false);
    setNewCompanionVal("");
  };

  const handleAddPersonInCharge = () => {
    const trimmed = newPersonInChargeVal.trim();
    if (!trimmed) return;
    setCustomPersonInCharge((prev) => {
      if (prev.includes(trimmed)) return prev;
      return [...prev, trimmed];
    });
    setRegistrationData((prev) => ({ ...prev, personInCharge: trimmed }));
    setIsAddingPersonInCharge(false);
    setNewPersonInChargeVal("");
  };

  // Conversion helper
  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const triggerUploadForSlot = (idx: number) => {
    setActiveSlotIndex(idx);
    if (fileInputRef.current) {
      fileInputRef.current.value = ""; // Reset value to allow uploading same file
      fileInputRef.current.click();
    }
  };

  const handleOpenPreview = async (name: string, url: string) => {
    if (url.startsWith("gdrive:")) {
      const fileId = url.split(":")[1];
      setPreviewDoc({ name, url });
      setPreviewLoading(true);
      setGdriveBase64Data(null);
      try {
        const base64 = await downloadGoogleDriveFileAsBase64(fileId);
        setGdriveBase64Data(base64);
      } catch (err: any) {
        console.error("Gagal memuat pratinjau Drive:", err);
        alert("Gagal memuat pratinjau Google Drive: " + (err?.message || err));
      } finally {
        setPreviewLoading(false);
      }
    } else {
      setPreviewDoc({ name, url });
      setGdriveBase64Data(null);
      setPreviewLoading(false);
    }
  };

  const processSelectedFile = async (file: File, slotIndex: number) => {
    let type: "image" | "pdf" | "excel" = "image";
    if (
      file.type === "application/pdf" ||
      file.name.slice(-4).toLowerCase() === ".pdf"
    ) {
      type = "pdf";
    } else if (
      file.name.slice(-4).toLowerCase() === ".xls" ||
      file.name.slice(-5).toLowerCase() === ".xlsx"
    ) {
      type = "excel";
    }

    setIsSavingAll(true);
    try {
      let finalUrl = "";
      let displaySize = `${(file.size / 1024).toFixed(1)} KB`;

      // Try to get Google Drive token (either cached or shared in Firestore)
      let token = getGoogleAccessToken();
      if (!token) {
        token = await fetchSharedGoogleAccessToken();
        if (token) {
          setGoogleAccessToken(token);
        }
      }

      // If token exists, attempt to upload to Google Drive
      if (token) {
        try {
          const slotLabel =
            documentSlots[slotIndex]?.label || "Berkas_Penerima";
          const recipientName = recipientInput.name || "Penerima_Tanpa_Nama";
          const recipientNik = recipientInput.nik || "";
          const sectorVal = registrationData.sector || "Umum";
          const programVal = registrationData.programName || "";
          const gdriveRes = await uploadFileToGoogleDrive(
            file,
            recipientName,
            recipientNik,
            slotLabel,
            sectorVal,
            programVal,
          );
          finalUrl = `gdrive:${gdriveRes.id}`;
          displaySize = `${(file.size / (1024 * 1024)).toFixed(2)} MB (Drive)`;
        } catch (gdriveErr: any) {
          console.error(
            "Gagal mengunggah ke Google Drive, dialihkan ke penyimpanan lokal:",
            gdriveErr,
          );
          if (gdriveErr?.message?.includes("kadaluarsa")) {
            alert(gdriveErr.message);
          }
          token = null; // trigger fallback
        }
      }

      // If no token or upload to Google Drive failed, fall back to base64
      if (!token) {
        let base64Url = await convertFileToBase64(file);

        if (type === "image") {
          const { compressImage } = await import("../lib/utils");
          base64Url = await compressImage(base64Url);
          const compressedSizeInKB = (base64Url.length * 0.75) / 1024;
          displaySize = `${compressedSizeInKB.toFixed(1)} KB (kompresi)`;
        }

        // Check against Firestore single document limit (roughly 1MB)
        const sizeInBytes = base64Url.length * 0.75;
        if (sizeInBytes >= 700000) {
          alert(
            `Gagal: Berkas "${file.name}" terlalu besar (${(sizeInBytes / 1024).toFixed(1)} KB) bahkan setelah dikompresi. Mohon pilih berkas dengan resolusi lebih kecil (maksimal 700KB) agar form dapat dikirim.`,
          );
          setIsSavingAll(false);
          return;
        }
        finalUrl = base64Url;
      }

      const updatedSlots = [...documentSlots];
      updatedSlots[slotIndex] = {
        ...updatedSlots[slotIndex],
        file: {
          name: file.name,
          type,
          url: finalUrl,
          size: displaySize,
        },
      };
      setDocumentSlots(updatedSlots);
    } catch (err: any) {
      console.error("Failed to upload/read file:", err);
      alert("Gagal mengunggah berkas: " + (err.message || err));
    } finally {
      setIsSavingAll(false);
      setActiveSlotIndex(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (activeSlotIndex === null) return;
    const file = e.target.files?.[0];
    if (!file) return;
    await processSelectedFile(file, activeSlotIndex);
  };

  const handleRemoveFileForSlot = (idx: number) => {
    const updatedSlots = [...documentSlots];
    updatedSlots[idx] = {
      ...updatedSlots[idx],
      file: undefined,
    };
    if (updatedSlots[idx].isCustomLabel) {
      updatedSlots[idx].label = "Lainnya";
    }
    setDocumentSlots(updatedSlots);
  };

  // Auto-synchronize "Siak Dakwah" parameters for the main registration data
  useEffect(() => {
    if (registrationData.sector === "Siak Dakwah") {
      setRegistrationData((prev) => {
        if (
          prev.subSector !== "Muallaf" ||
          prev.aidType !== "Santunan Tunai" ||
          prev.programName !== "Santunan Mualaf"
        ) {
          return {
            ...prev,
            subSector: "Muallaf",
            aidType: "Santunan Tunai",
            programName: "Santunan Mualaf",
          };
        }
        return prev;
      });
    }
  }, [registrationData.sector]);

  // Validate duplicate NIK or Name in database & current batch
  const checkDuplicate = (
    nik: string,
    name: string,
    subIndexToIgnore: number | null,
  ) => {
    const cleanNik = nik.trim();
    const cleanName = name.trim().toLowerCase();

    // 1. Check in existingRecipients (database)
    if (existingRecipients && existingRecipients.length > 0) {
      const currentEditingId =
        subIndexToIgnore !== null ? subRecipients[subIndexToIgnore]?.id : null;

      // First check NIK (strictly forbidden if duplicate of another record)
      const matchedNikDb = existingRecipients.find((r) => {
        if (currentEditingId && r.id === currentEditingId) return false;
        const isCurrentlyBeingEditedInBatch = subRecipients.some(
          (subR) => subR.id === r.id,
        );
        if (isCurrentlyBeingEditedInBatch) return false;
        return r.nik && cleanNik && r.nik.trim() === cleanNik;
      });

      if (matchedNikDb) {
        return {
          isDuplicate: true,
          type: "NIK",
          strict: false,
          message: `INFORMASI RIWAYAT PENERIMA:\n\nNIK (${cleanNik}) sudah pernah terdaftar di database atas nama "${matchedNikDb.name}".\n\nRiwayat Bantuan Sebelumnya:\n- Program: ${matchedNikDb.programName || "-"}\n- Jenis Bantuan: ${matchedNikDb.aidType || "-"}\n- Sektor: ${matchedNikDb.sector || "-"}\n\nPenerima diperbolehkan mengajukan lebih dari 1 kali.\nApakah Anda yakin ingin mendaftarkan pengajuan bantuan baru untuk penerima ini?`,
        };
      }

      // Next check Name (warning with confirmation allowed)
      const matchedNameDb = existingRecipients.find((r) => {
        if (currentEditingId && r.id === currentEditingId) return false;
        const isCurrentlyBeingEditedInBatch = subRecipients.some(
          (subR) => subR.id === r.id,
        );
        if (isCurrentlyBeingEditedInBatch) return false;
        return r.name && cleanName && r.name.trim().toLowerCase() === cleanName;
      });

      if (matchedNameDb) {
        return {
          isDuplicate: true,
          type: "NAME",
          strict: false,
          message: `Peringatan: Penerima dengan Nama "${name.trim()}" sudah ada di database (NIK: ${matchedNameDb.nik}) pada program "${matchedNameDb.programName || "-"}".\n\nApakah Anda yakin ingin tetap mendaftarkan orang ini?`,
        };
      }
    }

    // 2. Check in current sub-table batch (subRecipients)
    // First check NIK (strictly forbidden)
    const matchedNikBatchIdx = subRecipients.findIndex((r, idx) => {
      if (subIndexToIgnore !== null && idx === subIndexToIgnore) return false;
      return r.nik && cleanNik && r.nik.trim() === cleanNik;
    });

    if (matchedNikBatchIdx !== -1) {
      const matchedR = subRecipients[matchedNikBatchIdx];
      return {
        isDuplicate: true,
        type: "NIK",
        strict: false,
        message: `PERINGATAN GANDA (ROMBONGAN SAAT INI):\n\nNIK (${cleanNik}) sudah ada di sub-tabel pendaftaran rombongan ini atas nama "${matchedR.name}"!\n\nApakah Anda yakin penerima ini mengajukan beberapa bantuan sekaligus dalam satu rombongan ini?`,
      };
    }

    // Next check Name (warning with confirmation allowed)
    const matchedNameBatchIdx = subRecipients.findIndex((r, idx) => {
      if (subIndexToIgnore !== null && idx === subIndexToIgnore) return false;
      return r.name && cleanName && r.name.trim().toLowerCase() === cleanName;
    });

    if (matchedNameBatchIdx !== -1) {
      const matchedR = subRecipients[matchedNameBatchIdx];
      return {
        isDuplicate: true,
        type: "NAME",
        strict: false,
        message: `Peringatan: Nama "${name.trim()}" sudah ada di sub-tabel rombongan ini (NIK: ${matchedR.nik}).\n\nApakah Anda yakin ingin tetap mendaftarkannya?`,
      };
    }

    return { isDuplicate: false, strict: false, message: "", type: "" };
  };

  // Handle addition of a recipient into the sub-table
  const handleAddRecipientToSubTable = async (): Promise<boolean> => {
    if (!(recipientInput.name || "").trim()) {
      alert("Nama penerima wajib diisi.");
      return false;
    }
    if (!(recipientInput.nik || "") || (recipientInput.nik || "").length !== 16) {
      alert("NIK penerima wajib diisi dan harus tepat 16 digit.");
      return false;
    }
    if (!(recipientInput.kk || "") || (recipientInput.kk || "").length !== 16) {
      alert("Nomor KK penerima wajib diisi dan harus tepat 16 digit.");
      return false;
    }
    if (!(recipientInput.address || "").trim()) {
      alert("Alamat domisili lengkap wajib diisi.");
      return false;
    }
    if (!recipientInput.district) {
      alert("Kecamatan domisili wajib dipilih.");
      return false;
    }

    // Check for duplicate NIK or Name
    const dupCheck = checkDuplicate(
      recipientInput.nik,
      recipientInput.name,
      editingIndex,
    );
    if (dupCheck.isDuplicate) {
      if (dupCheck.strict) {
        alert(dupCheck.message);
        return false;
      } else {
        const confirmResult = window.confirm(dupCheck.message);
        if (!confirmResult) {
          return false;
        }
      }
    }

    setIsAddingToSub(true);
    // Simulate slight saving delay to show progress
    await new Promise((res) => setTimeout(res, 500));

    const updatedDocuments: AidDocument[] = documentSlots
      .filter((slot) => slot.file)
      .map((slot) => ({
        name: slot.label,
        type: slot.file!.type,
        url: slot.file!.url,
      }));

    const finalRecipient = {
      ...recipientInput,
      documents: updatedDocuments,
    };

    if (editingIndex !== null) {
      // Update existing item
      const updated = [...subRecipients];
      updated[editingIndex] = finalRecipient;
      setSubRecipients(updated);
      setEditingIndex(null);
    } else {
      // Add new item
      setSubRecipients([...subRecipients, finalRecipient]);
    }

    // Reset input fields completely for new entry
    setRecipientInput(DEFAULT_RECIPIENT_INPUT);

    setDocumentSlots(INITIAL_DOCUMENT_SLOTS.map((s) => ({ ...s })));
    setIsAddingToSub(false);
    return true;
  };

  // Turn off editing state and reset
  const handleCancelEditRecipient = () => {
    setEditingIndex(null);
    setRecipientInput(DEFAULT_RECIPIENT_INPUT);
    setDocumentSlots(INITIAL_DOCUMENT_SLOTS.map((s) => ({ ...s })));
  };

  // Load selected recipient back into the input fields for editing
  const handleLoadEditRecipient = (index: number) => {
    setEditingIndex(index);
    let recipient = subRecipients[index];

    setRecipientInput({
      ...DEFAULT_RECIPIENT_INPUT,
      ...recipient,
    });

    const slotsCopy: DocumentSlot[] = INITIAL_DOCUMENT_SLOTS.map((s) => ({
      ...s,
    }));

    if (recipient.documents && Array.isArray(recipient.documents)) {
      const docsToMap = [...recipient.documents];

      // Standard slots
      slotsCopy.forEach((slot) => {
        if (!slot.isCustomLabel) {
          const docIdx = docsToMap.findIndex((d) => d.name === slot.label);
          if (docIdx !== -1) {
            const matchedDoc = docsToMap[docIdx];
            slot.file = {
              name:
                matchedDoc.name +
                (matchedDoc.type === "pdf"
                  ? ".pdf"
                  : matchedDoc.type === "excel"
                    ? ".xlsx"
                    : ".jpg"),
              type: matchedDoc.type as any,
              url: matchedDoc.url,
            };
            docsToMap.splice(docIdx, 1);
          }
        }
      });

      // Custom "Lainnya" slots
      slotsCopy.forEach((slot) => {
        if (slot.isCustomLabel && !slot.file && docsToMap.length > 0) {
          const leftoverDoc = docsToMap.shift()!;
          slot.label = leftoverDoc.name;
          slot.file = {
            name:
              leftoverDoc.name +
              (leftoverDoc.type === "pdf"
                ? ".pdf"
                : leftoverDoc.type === "excel"
                  ? ".xlsx"
                  : ".jpg"),
            type: leftoverDoc.type as any,
            url: leftoverDoc.url,
          };
        }
      });
    }

    setDocumentSlots(slotsCopy);
    setCurrentStep(2);
    // Wait for the form to mount, then scroll smoothly
    setTimeout(() => {
      document
        .getElementById("form-input-penerima")
        ?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  // Remove recipient from the sub-table list
  const handleRemoveRecipientFromSubTable = (index: number) => {
    if (
      confirm(
        `Apakah Anda yakin ingin menghapus penerima "${subRecipients[index].name}" dari daftar sub-tabel ini?`,
      )
    ) {
      setSubRecipients((prev) => prev.filter((_, i) => i !== index));
      if (editingIndex === index) {
        setEditingIndex(null);
        setRecipientInput(DEFAULT_RECIPIENT_INPUT);
        setDocumentSlots(INITIAL_DOCUMENT_SLOTS.map((s) => ({ ...s })));
      } else if (editingIndex !== null && editingIndex > index) {
        setEditingIndex(editingIndex - 1);
      }
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { read, utils } = await import("xlsx");
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const jsonData = utils.sheet_to_json(sheet) as any[];

          const importedRecipients = jsonData.map((row) => {
            return {
              ...DEFAULT_RECIPIENT_INPUT,
              id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
              name: row.Nama || row.name || "",
              nik: String(row.NIK || row.nik || "").trim(),
              kk: String(row.KK || row.kk || "").trim(),
              address: row.Alamat || row.address || "",
              district: row.Kecamatan || row.district || "",
              kampung: row.Kampung || row.Kelurahan || row.kampung || "",
              phone: String(row.Telepon || row.NoHP || row.phone || "").trim(),
              gender: row.Gender || row["Jenis Kelamin"] || "Laki-laki",
              amountProposed: row["Jumlah Bantuan"] || row.amountProposed || 0,
              amountDisbursed: row["Jumlah Bantuan"] || row.amountDisbursed || 0,
            };
          });

          if (importedRecipients.length > 0) {
            setSubRecipients(prev => [...prev, ...importedRecipients]);
            alert(`${importedRecipients.length} data penerima berhasil diimpor!`);
          } else {
            alert("Tidak ada data yang valid ditemukan di dalam file Excel.");
          }
        } catch (err) {
          console.error("Gagal parse excel", err);
          alert("Format file tidak valid.");
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error("Gagal import excel", error);
      alert("Gagal mengimpor file Excel. Pastikan format sudah benar.");
    }

    if (excelFileInputRef.current) {
      excelFileInputRef.current.value = "";
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const { utils, writeFile } = await import("xlsx");
      const templateData = [{
        Nama: "Budi Santoso",
        NIK: "1408010101900001",
        KK: "1408010101900001",
        Alamat: "Jl. Sudirman No 1",
        Kecamatan: "Siak",
        Kampung: "Kampung Dalam",
        Telepon: "081234567890",
        "Jenis Kelamin": "Laki-laki",
        "Jumlah Bantuan": 500000
      }];
      const worksheet = utils.json_to_sheet(templateData);
      const workbook = utils.book_new();
      utils.book_append_sheet(workbook, worksheet, "Template Penerima");
      writeFile(workbook, "Template_Data_Penerima.xlsx");
    } catch (error) {
      console.error("Gagal download template", error);
      alert("Gagal mengunduh template Excel.");
    }
  };

  const handleAddAdditionalParameter = () => {
    if (!subRecipients.length) {
      alert("Tabel penerima kosong. Harap isi penerima pada Step 2.");
      return;
    }
    
    // Save current parameter
    setSavedGroups(prev => [...prev, {
      registrationData: JSON.parse(JSON.stringify(registrationData)),
      subRecipients: JSON.parse(JSON.stringify(subRecipients)),
      printGroup: true
    }]);

    // Reset editor
    setRegistrationData({
      ...DEFAULT_REGISTRATION_DATA,
      registrationId: generateRegId()
    });
    setSubRecipients([]);
    setCurrentStep(1); // Back to Step 1
    
    // Clear storage to prevent reload clash
    localStorage.removeItem("recipient_form_draft");
  };

  const handleDeleteSavedGroup = (index: number) => {
    const newSavedGroups = [...savedGroups];
    newSavedGroups.splice(index, 1);
    setSavedGroups(newSavedGroups);
  };

  const handleEditSavedGroup = (index: number) => {
    const groupToEdit = savedGroups[index];
    const newSavedGroups = [...savedGroups];
    newSavedGroups.splice(index, 1);

    // If current group has data, pack it back into savedGroups
    if (subRecipients.length > 0) {
      newSavedGroups.push({
        registrationData: JSON.parse(JSON.stringify(registrationData)),
        subRecipients: JSON.parse(JSON.stringify(subRecipients)),
        printGroup: true
      });
    }

    setSavedGroups(newSavedGroups);
    setRegistrationData(groupToEdit.registrationData);
    setSubRecipients(groupToEdit.subRecipients || []);
    setCurrentStep(1); // Back to Step 1

    // Auto-load the first recipient into edit form so the user doesn't see an empty form
    if (groupToEdit.subRecipients && groupToEdit.subRecipients.length > 0) {
      setEditingIndex(0);
      const recipient = groupToEdit.subRecipients[0];
      setRecipientInput({ ...DEFAULT_RECIPIENT_INPUT, ...recipient });

      const slotsCopy: DocumentSlot[] = INITIAL_DOCUMENT_SLOTS.map((s) => ({ ...s }));
      if (recipient.documents && Array.isArray(recipient.documents)) {
        const docsToMap = [...recipient.documents];
        // Standard slots
        slotsCopy.forEach((slot) => {
          if (!slot.isCustomLabel) {
            const docIdx = docsToMap.findIndex((d) => d.name === slot.label);
            if (docIdx !== -1) {
              const matchedDoc = docsToMap[docIdx];
              slot.file = {
                name: matchedDoc.name + (matchedDoc.type === "pdf" ? ".pdf" : matchedDoc.type === "excel" ? ".xlsx" : ".jpg"),
                type: matchedDoc.type as any,
                url: matchedDoc.url,
              };
              docsToMap.splice(docIdx, 1);
            }
          }
        });
        // Custom "Lainnya" slots
        slotsCopy.forEach((slot) => {
          if (slot.isCustomLabel && !slot.file && docsToMap.length > 0) {
            const leftoverDoc = docsToMap.shift()!;
            slot.label = leftoverDoc.name;
            slot.file = {
              name: leftoverDoc.name + (leftoverDoc.type === "pdf" ? ".pdf" : leftoverDoc.type === "excel" ? ".xlsx" : ".jpg"),
              type: leftoverDoc.type as any,
              url: leftoverDoc.url,
            };
          }
        });
      }
      setDocumentSlots(slotsCopy);
    } else {
      // Reset sub-form editor to avoid carry-over
      setRecipientInput(DEFAULT_RECIPIENT_INPUT);
      setEditingIndex(null);
      setDocumentSlots(INITIAL_DOCUMENT_SLOTS.map((s) => ({ ...s })));
    }

    localStorage.removeItem("recipient_form_draft");
  };

  // Submit the entire compound form (Tabel Utama + Sub Tabel)
  const handleSaveAllData = async (e: React.FormEvent) => {
    e.preventDefault();

    let finalRecipients = [...subRecipients];

    // If the list is empty but the user filled out the recipient form, try to auto-add it
    // A draft is only present if "name" is typed, since "kk", "address", and "district" are retained helper fields.
    const hasCurrentRecipientDraft = !!(
      recipientInput.name && recipientInput.name.trim()
    );
    if (hasCurrentRecipientDraft) {
      // Ensure all required sub-fields validate on auto-insert
      if (
        !recipientInput.name ||
        !recipientInput.nik ||
        !recipientInput.kk ||
        !recipientInput.address ||
        !recipientInput.district
      ) {
        alert(
          "Mohon lengkapi seluruh kolom wajib pendaftaran penerima (*), atau kosongkan kolom formulir jika Anda telah menambahkan seluruh penerima ke sub-tabel di bawah.",
        );
        return;
      }
      if ((recipientInput.nik || "").length !== 16 || (recipientInput.kk || "").length !== 16) {
        alert("NIK dan No KK harus tepat 16 digit.");
        return;
      }

      // Check for duplicate NIK or Name for the current draft recipient
      const dupCheck = checkDuplicate(
        recipientInput.nik,
        recipientInput.name,
        editingIndex,
      );
      if (dupCheck.isDuplicate) {
        if (dupCheck.strict) {
          alert(dupCheck.message);
          return;
        } else {
          const confirmResult = window.confirm(dupCheck.message);
          if (!confirmResult) {
            return;
          }
        }
      }

      const draftDocs: AidDocument[] = documentSlots
        .filter((slot) => slot.file)
        .map((slot) => ({
          name: slot.label,
          type: slot.file!.type,
          url: slot.file!.url,
        }));

      finalRecipients.push({
        ...recipientInput,
        documents: draftDocs,
      });
    }

    if (finalRecipients.length === 0) {
      alert(
        "Sub-tabel penerima masih kosong. Mohon tambahkan minimal 1 penerima.",
      );
      return;
    }

    // Verify main parameters
    if (!registrationData.sector) {
      alert("Mohon pilih Bidang.");
      return;
    }
    if (!registrationData.aidType) {
      alert("Mohon pilih Jenis Bantuan.");
      return;
    }

    // Combine finalRecipients with registrationData
    const mappedCurrentGroup = finalRecipients.map((r) => {
      const { documents: groupDocs, status: groupStatus, ...groupSettings } = registrationData;
      return {
        ...r,
        ...groupSettings,
        amountProposed: r.amountProposed ? Number(r.amountProposed) : 0,
        amountDisbursed: r.amountDisbursed ? Number(r.amountDisbursed) : 0,
      };
    });

    // Process past saved groups
    const mappedSavedGroups = savedGroups.flatMap(group => {
      const { documents: groupDocs, status: groupStatus, ...groupSettings } = group.registrationData;
      return group.subRecipients.map(r => ({
        ...r,
        ...groupSettings,
        amountProposed: r.amountProposed ? Number(r.amountProposed) : 0,
        amountDisbursed: r.amountDisbursed ? Number(r.amountDisbursed) : 0,
      }));
    });

    const submissionData = [...mappedSavedGroups, ...mappedCurrentGroup];

    setIsSavingAll(true);
    try {
      await onSubmit(submissionData);
      if (!initialGroupRecipients || initialGroupRecipients.length === 0) {
        localStorage.removeItem("recipient_form_draft");
      }
    } finally {
      setIsSavingAll(false);
    }
  };

  const handleNextStep = async () => {
    const formElement = document.getElementById("recipient-form") as HTMLFormElement;
    if (formElement && !formElement.reportValidity()) {
      return;
    }

    if (currentStep === 2) {
      if (
        (recipientInput.name || "").trim() !== "" ||
        (recipientInput.nik || "").trim() !== "" ||
        (recipientInput.kk || "").trim() !== "" ||
        (recipientInput.address || "").trim() !== ""
      ) {
        const success = await handleAddRecipientToSubTable();
        if (success) {
          setCurrentStep(3);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } else {
        setCurrentStep(3);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } else if (currentStep < 5) {
      setCurrentStep(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div className="space-y-4 pb-28 relative">
      {/* Stepper Progress */}
      <div className="bg-white p-3 sm:px-6 sm:py-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between relative">
        <div className="absolute top-1/2 left-8 right-8 h-1 bg-slate-100 -translate-y-1/2 rounded-full hidden sm:block z-0"></div>
        <div
          className="absolute top-1/2 left-8 h-1 bg-indigo-600 -translate-y-1/2 rounded-full hidden sm:block z-0 transition-all duration-500"
          style={{
            width:
              currentStep === 1 ? "0%" :
              currentStep === 2 ? "25%" :
              currentStep === 3 ? "50%" :
              currentStep === 4 ? "75%" : "100%",
          }}
        ></div>

        {[
          { step: 1, label: "Parameter Registrasi" },
          { step: 2, label: "Input Data Penerima" },
          { step: 3, label: "Form Tanda Terima & Permohonan Bantuan" },
          { step: 4, label: "Form MPZIS & E-PPD" },
          { step: 5, label: "Konfirmasi Data" },
        ].map((item) => (
          <button
            key={item.step}
            type="button"
            onClick={() => {
              if (currentStep === 1 && item.step > 1) {
                const formElement = document.getElementById(
                  "recipient-form",
                ) as HTMLFormElement;
                if (formElement && !formElement.reportValidity()) {
                  return;
                }
              }
              if (item.step > 2 && subRecipients.length === 0) {
                alert("Silakan isi data penerima minimal 1 orang terlebih dahulu.");
                return;
              }
              setCurrentStep(item.step);
            }}
            className="relative z-10 flex flex-col items-center gap-1.5 group outline-none"
          >
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-300 ring-4 ${
                currentStep === item.step
                  ? "bg-indigo-600 text-white ring-indigo-50 scale-105 shadow-md"
                  : currentStep > item.step
                    ? "bg-indigo-600 text-white ring-transparent"
                    : "bg-white text-slate-400 border-2 border-slate-200 ring-transparent group-hover:border-indigo-300"
              }`}
            >
              {currentStep > item.step ? (
                <Check className="w-4 h-4" />
              ) : (
                item.step
              )}
            </div>
            <span
              className={`text-[11px] font-semibold hidden sm:block ${
                currentStep === item.step
                  ? "text-indigo-700"
                  : currentStep > item.step
                    ? "text-slate-800"
                    : "text-slate-400"
              }`}
            >
              {item.label}
            </span>
          </button>
        ))}
      </div>

      <form
        id="recipient-form"
        onSubmit={(e) => e.preventDefault()}
        className="space-y-4 animate-in fade-in duration-300"
      >
        {/* SECTION 1: TABEL UTAMA - PARAMETER REGISTRASI & PENGAJUAN */}
        {currentStep === 1 && (
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm animate-in fade-in duration-300">
            <div className="flex items-center gap-2.5 mb-4 pb-2 border-b border-slate-100/80">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <Layers className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base">
                  Parameter Registrasi & Pengajuan
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Informasi utama permohonan yang berlaku untuk seluruh
                  rombongan/sub-penerima.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  ID Registrasi
                </label>
                <input
                  type="text"
                  className="form-input-custom bg-slate-100 font-mono !cursor-not-allowed"
                  value={registrationData.registrationId}
                  readOnly
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  Kategori Administrasi *
                </label>
                <select
                  required
                  className="form-input-custom font-medium"
                  value={registrationData.adminCategory}
                  onChange={(e) => handleAdminCategoryChange(e.target.value)}
                >
                  <option value="">Pilih Kategori Administrasi</option>
                  <option value="Bantuan Sosial/Mustahik">
                    Bantuan Sosial/Mustahik
                  </option>
                  <option value="Honorarium Pendamping">
                    Honorarium Pendamping
                  </option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  Jenis Layanan *
                </label>
                <select
                  required
                  className="form-input-custom font-medium"
                  value={registrationData.serviceType}
                  onChange={(e) => handleServiceTypeChange(e.target.value)}
                >
                  <option value="">Pilih Jenis Layanan</option>
                  {(!registrationData.adminCategory ||
                    registrationData.adminCategory ===
                      "Bantuan Sosial/Mustahik") && (
                    <>
                      <option value="Layanan Konter">Layanan Konter</option>
                      <option value="Program Bulanan">Program Bulanan</option>
                    </>
                  )}
                  {registrationData.adminCategory ===
                    "Honorarium Pendamping" && (
                    <option value="Assesment, Asistensi, dan Monev">
                      Assesment, Asistensi, dan Monev
                    </option>
                  )}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  Ashnaf *
                </label>
                <select
                  required
                  className="form-input-custom font-medium"
                  value={registrationData.ashnaf}
                  onChange={(e) =>
                    setRegistrationData({
                      ...registrationData,
                      ashnaf: e.target.value,
                    })
                  }
                >
                  <option value="">Pilih Ashnaf</option>
                  <option value="Fakir">Fakir</option>
                  <option value="Miskin">Miskin</option>
                  <option value="Amil">Amil</option>
                  <option value="Muallaf">Muallaf</option>
                  <option value="Riqab">Riqab</option>
                  <option value="Gharim">Gharim</option>
                  <option value="Fisabilillah">Fisabilillah</option>
                  <option value="Ibnu Sabil">Ibnu Sabil</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  Sumber Berkas *
                </label>
                <select
                  required
                  className="form-input-custom font-medium"
                  value={registrationData.source}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRegistrationData({
                      ...registrationData,
                      source: val,
                      institutionName: [
                        "UPZ",
                        "Online",
                        "Instansi",
                        "Lembaga",
                      ].includes(val)
                        ? registrationData.institutionName
                        : "",
                    });
                  }}
                >
                  <option value="">Pilih Sumber</option>
                  <option value="Internal">Internal</option>
                  <option value="KLM">KLM</option>
                  <option value="UPZ">UPZ</option>
                  <option value="Online">Online</option>
                  <option value="Instansi">Instansi</option>
                  <option value="Lembaga">Lembaga</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  Sumber Dana *
                </label>
                <select
                  required
                  className="form-input-custom font-medium"
                  value={registrationData.fundingSource}
                  onChange={(e) =>
                    setRegistrationData({
                      ...registrationData,
                      fundingSource: e.target.value,
                    })
                  }
                >
                  <option value="">Pilih Sumber Dana</option>
                  <option value="Zakat">Zakat</option>
                  <option value="Infaq">Infaq</option>
                  <option value="Shadaqah">Shadaqah</option>
                  <option value="DSKL">DSKL</option>
                </select>
              </div>

              {["UPZ", "Online", "Instansi", "Lembaga"].includes(
                registrationData.source,
              ) && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">
                    Nama Lembaga *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Ketik nama lembaga/instansi/UPZ"
                    className="form-input-custom font-medium animate-in slide-in-from-top-1 duration-250 border-indigo-200"
                    value={registrationData.institutionName}
                    onChange={(e) =>
                      setRegistrationData({
                        ...registrationData,
                        institutionName: e.target.value,
                      })
                    }
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  Tgl Masuk Berkas *
                </label>
                <input
                  required
                  type="date"
                  className="form-input-custom font-medium"
                  value={registrationData.submissionDate}
                  onChange={(e) =>
                    setRegistrationData({
                      ...registrationData,
                      submissionDate: e.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">
                    Pendamping Program
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsAddingCompanion(!isAddingCompanion)}
                    className="text-[10px] text-indigo-600 font-extrabold hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Tambah Manual
                  </button>
                </div>
                <select
                  className="form-input-custom font-medium"
                  value={registrationData.companion}
                  onChange={(e) =>
                    setRegistrationData({
                      ...registrationData,
                      companion: e.target.value,
                    })
                  }
                >
                  <option value="">Pilih Pendamping</option>
                  {[...SIAK_COMPANIONS, ...customCompanions].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {isAddingCompanion && (
                  <div className="mt-1.5 p-2 bg-indigo-50/50 rounded-xl border border-indigo-100 flex gap-2 items-center duration-150 animate-in fade-in-50 slide-in-from-top-1">
                    <input
                      type="text"
                      placeholder="Nama Pendamping baru..."
                      className="form-input-custom font-medium text-xs bg-white py-1 flex-1 h-8"
                      value={newCompanionVal}
                      onChange={(e) => setNewCompanionVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddCompanion();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddCompanion}
                      className="bg-indigo-600 text-white font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg hover:bg-indigo-750 transition-colors cursor-pointer"
                    >
                      Simpan
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingCompanion(false);
                        setNewCompanionVal("");
                      }}
                      className="bg-slate-200 text-slate-700 font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg hover:bg-slate-300 transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">
                    Penanggung Jawab
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setIsAddingPersonInCharge(!isAddingPersonInCharge)
                    }
                    className="text-[10px] text-indigo-600 font-extrabold hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Tambah Manual
                  </button>
                </div>
                <select
                  className="form-input-custom font-medium"
                  value={registrationData.personInCharge}
                  onChange={(e) =>
                    setRegistrationData({
                      ...registrationData,
                      personInCharge: e.target.value,
                    })
                  }
                >
                  <option value="">Pilih Penanggung Jawab</option>
                  {[...PERSON_IN_CHARGE_OPTIONS, ...customPersonInCharge].map(
                    (name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ),
                  )}
                </select>
                {isAddingPersonInCharge && (
                  <div className="mt-1.5 p-2 bg-indigo-50/50 rounded-xl border border-indigo-100 flex gap-2 items-center duration-150 animate-in fade-in-50 slide-in-from-top-1">
                    <input
                      type="text"
                      placeholder="Nama Penanggung Jawab baru..."
                      className="form-input-custom font-medium text-xs bg-white py-1 flex-1 h-8"
                      value={newPersonInChargeVal}
                      onChange={(e) => setNewPersonInChargeVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddPersonInCharge();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddPersonInCharge}
                      className="bg-indigo-600 text-white font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg hover:bg-indigo-750 transition-colors cursor-pointer"
                    >
                      Simpan
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingPersonInCharge(false);
                        setNewPersonInChargeVal("");
                      }}
                      className="bg-slate-200 text-slate-700 font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg hover:bg-slate-300 transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  Bidang *
                </label>
                <select
                  required
                  className="form-input-custom font-medium"
                  value={registrationData.sector}
                  onChange={(e) =>
                    setRegistrationData({
                      ...registrationData,
                      sector: e.target.value,
                      subSector: "",
                      aidType: "",
                      programName: "",
                    })
                  }
                >
                  <option value="">Pilih Bidang</option>
                  {Object.keys(SIAK_SECTORS)
                    .filter((s) =>
                      registrationData.serviceType === "Program Bulanan"
                        ? [
                            "Siak Cerdas",
                            "Siak Dakwah",
                            "Siak Peduli",
                          ].includes(s)
                        : true,
                    )
                    .map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">
                    Nama Program *
                  </label>
                  {registrationData.sector && (
                    <button
                      type="button"
                      onClick={() =>
                        setIsAddingProgramName(!isAddingProgramName)
                      }
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 active:scale-95 duration-100 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Tambah Manual
                    </button>
                  )}
                </div>
                <select
                  required
                  className="form-input-custom font-medium"
                  value={registrationData.programName}
                  onChange={(e) => handleProgramNameChange(e.target.value)}
                  disabled={!registrationData.sector}
                >
                  <option value="">Pilih Program</option>
                  {registrationData.sector &&
                    [
                      ...(SIAK_PROGRAM_NAMES[registrationData.sector] || []),
                      ...(customProgramNames[registrationData.sector] || []),
                    ]
                      .filter((p) => {
                        if (registrationData.serviceType === "Layanan Konter") {
                          if (registrationData.sector === "Siak Cerdas") {
                            if (
                              ![
                                "Beasiswa Santri Tingkat (MI, MTs dan MA)",
                                "Beasiswa Cendikia BAZNAS Jenjang S1",
                                "Beasiswa Cendikia BAZNAS Jenjang D3-D4",
                                "Beasiswa Tahfidz Qur'an 1-5 Juz",
                                "Beasiswa Riset BAZNAS S1",
                                "Beasiswa Disabilitas, 3T dan KAT",
                                "Bantuan Biaya Pendidikan",
                                "Bantuan Pendidikan",
                                "Bantuan Pendidikan Infak Terikat",
                                "Seragam Sekolah Tingkat SD",
                                "Seragam Sekolah Tingkat SMP",
                                "Seragam Sekolah Tingkat (MI, MTs dan MA)",
                                "Santunan Guru Madrasah Aliyah (MA)",
                              ].includes(p)
                            )
                              return false;
                          } else if (registrationData.sector === "Siak Peduli") {
                            if (
                              ![
                                "Biaya Hidup (Konsumtif)",
                                "Program Rumah Tinggal Layak Huni (RTLH)",
                                "Biaya Hidup (Ibnu Sabil)",
                                "Program ATM Beras",
                                "Bantuan Alat Kesehatan",
                                "Program Rumah Layak Huni (RLH)",
                                "Program Pemasangan KWH Listrik",
                                "Program Khitanan Anak Sholeh",
                                "Bantuan Biaya Hidup (Paket Bahagia BAZNAS)",
                                "Bantuan Ghorimin",
                                "Program Tebar Hewan Qur'ban (DSKL)",
                                "Bantuan Makanan (Fidyah)",
                                "Bantuan Biaya Hidup (Zakat Fitrah) UPZ",
                                "Bantuan Biaya Hidup (Zakat Fitrah)"
                              ].includes(p)
                            )
                              return false;
                          }
                        } else if (
                          registrationData.serviceType === "Program Bulanan"
                        ) {
                          if (registrationData.sector === "Siak Cerdas") {
                            if (
                              ![
                                "Santri Binaan (Ponpes Darul Hadist)",
                                "Santri Binaan (SMP Cendikia)",
                                "Santri Binaan (Abdur Rahman) di Darul Hadist Siak",
                                "Satu Keluarga Satu Sarjana (SKSS)",
                              ].includes(p)
                            )
                              return false;
                          } else if (
                            registrationData.sector === "Siak Dakwah"
                          ) {
                            if (
                              ![
                                "Santunan Muallaf",
                                "Da'i Mukim",
                                "Program Da'I Daerah 3T",
                                "Bantuan Saguhati Mu'allaf",
                                "Pembinaan Mu'allaf",
                                "Imam Masjid Paripurna",
                              ].includes(p)
                            )
                              return false;
                          } else if (
                            registrationData.sector === "Siak Peduli"
                          ) {
                            if (
                              !["Safa", "Program ATM Beras", "Yafa"].includes(p)
                            )
                              return false;
                          }
                        }
                        return true;
                      })
                      .map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                </select>
                {isAddingProgramName && (
                  <div className="mt-1.5 p-2 bg-indigo-50/50 rounded-xl border border-indigo-100 flex gap-2 items-center duration-150 animate-in fade-in-50 slide-in-from-top-1">
                    <input
                      type="text"
                      placeholder="Nama Program baru..."
                      className="form-input-custom font-medium text-xs bg-white py-1 flex-1 h-8"
                      value={newProgramNameVal}
                      onChange={(e) => setNewProgramNameVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddProgramName();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddProgramName}
                      className="bg-indigo-600 text-white font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg hover:bg-indigo-750 transition-colors cursor-pointer"
                    >
                      Simpan
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingProgramName(false);
                        setNewProgramNameVal("");
                      }}
                      className="bg-slate-200 text-slate-700 font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg hover:bg-slate-300 transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">
                    Jenis Bantuan *
                  </label>
                  {registrationData.sector && (
                    <button
                      type="button"
                      onClick={() => setIsAddingAidType(!isAddingAidType)}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 active:scale-95 duration-100 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Tambah Manual
                    </button>
                  )}
                </div>
                <select
                  required
                  className="form-input-custom font-medium"
                  value={registrationData.aidType}
                  onChange={(e) =>
                    setRegistrationData({
                      ...registrationData,
                      aidType: e.target.value as any,
                    })
                  }
                  disabled={!registrationData.sector}
                >
                  <option value="">Pilih Jenis</option>
                  {registrationData.sector &&
                    [
                      ...(SIAK_AID_TYPES[registrationData.sector] || []),
                      ...(customAidTypes[registrationData.sector] || []),
                    ]
                      .filter((ss) => {
                        if (
                          registrationData.serviceType === "Program Bulanan" &&
                          registrationData.sector === "Siak Cerdas"
                        ) {
                          if (
                            ![
                              "Pembinaan & Biaya Hidup Santri",
                              "Pembinaan & Biaya Mahasiswa",
                            ].includes(ss) &&
                            !["Pembinaan & Biaya Hidup Mahasiswa"].includes(ss)
                          )
                            return false;
                        }

                        if (
                          registrationData.sector === "Siak Cerdas" &&
                          registrationData.programName
                        ) {
                          const p = registrationData.programName;
                          if (
                            p === "Beasiswa SKSS BAZNAS Siak" &&
                            ss !== "Beasiswa Pendidikan (Rutin Berkala)"
                          )
                            return false;
                          if (
                            p === "Satu Keluarga Satu Sarjana (SKSS)" &&
                            ss !== "Pembinaan & Biaya Hidup Mahasiswa"
                          )
                            return false;
                          if (
                            [
                              "Beasiswa Santri Tingkat (MI, MTs dan MA)",
                              "Beasiswa Cendikia BAZNAS Jenjang S1",
                              "Beasiswa Cendikia BAZNAS Jenjang D3-D4",
                              "Beasiswa Tahfidz Qur'an 1-5 Juz",
                              "Beasiswa Riset BAZNAS S1",
                              "Beasiswa Disabilitas, 3T dan KAT",
                            ].includes(p) &&
                            ss !==
                              "Beasiswa Pendidikan (Sekali Bayar / Insidental)"
                          )
                            return false;
                          if (
                            [
                              "Bantuan Biaya Pendidikan",
                              "Bantuan Pendidikan",
                              "Bantuan Pendidikan Infak Terikat",
                            ].includes(p) &&
                            ss !==
                              "Bantuan Biaya Pendidikan (Insidental / Tunggakan)"
                          )
                            return false;
                          if (
                            [
                              "Seragam Sekolah Tingkat SD",
                              "Seragam Sekolah Tingkat SMP",
                              "Seragam Sekolah Tingkat (MI, MTs dan MA)",
                            ].includes(p) &&
                            ss !== "Bantuan Perlengkapan & Sarana Belajar"
                          )
                            return false;
                          if (
                            [
                              "Santri Binaan (Ponpes Darul Hadist)",
                              "Santri Binaan (SMP Cendikia)",
                              "Santri Binaan (Abdur Rahman) di Darul Hadist Siak",
                            ].includes(p) &&
                            ss !== "Pembinaan & Biaya Hidup Santri"
                          )
                            return false;
                          if (
                            p === "Santunan Guru Madrasah Aliyah (MA)" &&
                            ss !== "Santunan & Insentif Guru (Pendidik)"
                          )
                            return false;
                        }

                        return true;
                      })
                      .map((ss) => (
                        <option key={ss} value={ss}>
                          {ss}
                        </option>
                      ))}
                </select>
                {isAddingAidType && (
                  <div className="mt-1.5 p-2 bg-indigo-50/50 rounded-xl border border-indigo-100 flex gap-2 items-center duration-150 animate-in fade-in-50 slide-in-from-top-1">
                    <input
                      type="text"
                      placeholder="Nama Jenis Bantuan baru..."
                      className="form-input-custom font-medium text-xs bg-white py-1 flex-1 h-8"
                      value={newAidTypeVal}
                      onChange={(e) => setNewAidTypeVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddAidType();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddAidType}
                      className="bg-indigo-600 text-white font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg hover:bg-indigo-750 transition-colors cursor-pointer"
                    >
                      Simpan
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingAidType(false);
                        setNewAidTypeVal("");
                      }}
                      className="bg-slate-200 text-slate-700 font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg hover:bg-slate-300 transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* SECTION 2: FORM INPUT DETIL PENERIMA (ADD / EDIT) */}
        {currentStep === 2 && (
          <div
            id="form-input-penerima"
            className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm animate-in fade-in duration-300"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-100/80">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <IdCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">
                    {editingIndex !== null
                      ? `Edit Data Penerima (Urutan #${editingIndex + 1})`
                      : "Form Input Data Penerima"}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Lengkapi biodata individu penerima manfaat di bawah ini.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 self-start lg:self-auto">
                {editingIndex === null && (
                  <>
                    <input
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      ref={excelFileInputRef}
                      onChange={handleImportExcel}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => excelFileInputRef.current?.click()}
                      className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      Import Excel
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="text-xs bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Template Excel
                    </button>
                  </>
                )}
                {editingIndex !== null && (
                  <span className="text-xs bg-amber-100 text-amber-800 font-bold px-3 py-1 rounded-full animate-pulse">
                    Sedang Mengubah Data
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-8">
              {/* SECTION: INFORMASI PRIBADI */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
                  <IdCard className="h-5 w-5 text-indigo-600" />
                  <h4 className="text-base font-bold text-slate-800">Informasi Pribadi</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-5">
                  <div className="space-y-2 lg:col-span-2 xl:col-span-2">
                    <label className="text-sm font-semibold text-slate-700">
                      Nama Penerima *
                    </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <User className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      className="form-input-custom font-medium pl-10"
                      value={recipientInput.name}
                      onChange={(e) =>
                        setRecipientInput({
                          ...recipientInput,
                          name: e.target.value,
                        })
                      }
                      onBlur={() => 
                        setRecipientInput({
                          ...recipientInput,
                          name: toTitleCase(recipientInput.name),
                        })
                      }
                      placeholder="Nama lengkap sesuai KTP"
                    />
                  </div>
                </div>

                <div className="space-y-2 xl:col-span-1">
                  <label className="text-sm font-semibold text-slate-700">
                    NIK *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <CreditCard className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      maxLength={16}
                      className={cn(
                        "form-input-custom font-mono pl-10 transition-colors",
                        (recipientInput.nik || "").length > 0 && (recipientInput.nik || "").length < 16 && "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20",
                        (recipientInput.nik || "").length === 16 && "border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20"
                      )}
                      value={recipientInput.nik}
                      onChange={(e) => {
                        const newNik = e.target.value.replace(/\D/g, "");
                        const updates: any = { nik: newNik };
                        if (newNik.length === 16) {
                          const extracted = extractNIK(newNik);
                          if (extracted && !extracted.dob.includes("NaN")) {
                            updates.gender = extracted.gender;
                            updates.dob = extracted.dob;
                          }
                        }
                        setRecipientInput({
                          ...recipientInput,
                          ...updates
                        });
                      }}
                      placeholder="16 Digit NIK"
                    />
                  </div>
                  {(recipientInput.nik || "").length > 0 &&
                    (recipientInput.nik || "").length < 16 && (
                      <p className="text-xs text-rose-500 font-medium">
                        NIK kurang {16 - (recipientInput.nik || "").length} digit
                      </p>
                    )}
                </div>

                <div className="space-y-2 xl:col-span-1">
                  <label className="text-sm font-semibold text-slate-700">
                    Nomor KK *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <FileText className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      maxLength={16}
                      className={cn(
                        "form-input-custom font-mono pl-10 transition-colors",
                        (recipientInput.kk || "").length > 0 && (recipientInput.kk || "").length < 16 && "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20",
                        (recipientInput.kk || "").length === 16 && "border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20"
                      )}
                      value={recipientInput.kk}
                      onChange={(e) =>
                        setRecipientInput({
                          ...recipientInput,
                          kk: e.target.value.replace(/\D/g, ""),
                        })
                      }
                      placeholder="16 Digit No KK"
                    />
                  </div>
                  {(recipientInput.kk || "").length > 0 &&
                    (recipientInput.kk || "").length < 16 && (
                      <p className="text-xs text-rose-500 font-medium">
                        Nomor KK kurang {16 - (recipientInput.kk || "").length} digit
                      </p>
                    )}
                </div>

                <div className="space-y-2 xl:col-span-1">
                  <label className="text-sm font-semibold text-slate-700">
                    Tempat Lahir
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <MapPin className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      className="form-input-custom font-medium pl-10"
                      value={recipientInput.pob}
                      onChange={(e) =>
                        setRecipientInput({
                          ...recipientInput,
                          pob: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2 xl:col-span-1">
                  <label className="text-sm font-semibold text-slate-700">
                    Tanggal Lahir
                  </label>
                  <input
                    type="text"
                    placeholder="DD/MM/YYYY"
                    className="form-input-custom font-medium"
                    value={recipientInput.dob}
                    onChange={(e) => {
                      let val = e.target.value.replace(/\D/g, "");
                      if (val.length > 2) val = val.substring(0, 2) + "/" + val.substring(2);
                      if (val.length > 5) val = val.substring(0, 5) + "/" + val.substring(5, 9);
                      setRecipientInput({ ...recipientInput, dob: val });
                    }}
                    maxLength={10}
                  />
                </div>

                <div className="space-y-2 xl:col-span-1">
                  <label className="text-sm font-semibold text-slate-700">
                    Jenis Kelamin
                  </label>
                  <select
                    className="form-input-custom font-medium"
                    value={recipientInput.gender}
                    onChange={(e) =>
                      setRecipientInput({
                        ...recipientInput,
                        gender: e.target.value as any,
                      })
                    }
                  >
                    <option value="Laki-laki">Laki-laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                </div>

                <div className="space-y-2 xl:col-span-1">
                  <label className="text-sm font-semibold text-slate-700">
                    Status Hubungan Keluarga
                  </label>
                  <select
                    className="form-input-custom font-medium"
                    value={recipientInput.familyStatus}
                    onChange={(e) =>
                      setRecipientInput({
                        ...recipientInput,
                        familyStatus: e.target.value,
                      })
                    }
                  >
                    <option value="">Pilih Status</option>
                    <option value="Kepala Keluarga">Kepala Keluarga</option>
                    <option value="Istri">Istri</option>
                    <option value="Anak">Anak</option>
                    <option value="Famili Lain">Famili Lain</option>
                  </select>
                </div>

                <div className="space-y-2 xl:col-span-2">
                  <label className="text-sm font-semibold text-slate-700">
                    Nama Kepala Keluarga
                  </label>
                  <input
                    type="text"
                    className="form-input-custom font-medium"
                    value={recipientInput.headOfFamilyName}
                    onChange={(e) =>
                      setRecipientInput({
                        ...recipientInput,
                        headOfFamilyName: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="space-y-2 xl:col-span-2">
                  <label className="text-sm font-semibold text-slate-700">
                    Tgl Lahir Kepala Keluarga
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      className="form-input-custom font-medium px-2"
                      value={(recipientInput.headOfFamilyDob || "").split('/')[0] || ""}
                      onChange={(e) => {
                        const [, m = "", y = ""] = (recipientInput.headOfFamilyDob || "").split('/');
                        setRecipientInput({ ...recipientInput, headOfFamilyDob: `${e.target.value}/${m}/${y}` });
                      }}
                    >
                      <option value="">Hari</option>
                      {Array.from({length: 31}, (_, i) => i + 1).map(d => (
                        <option key={d} value={String(d).padStart(2, '0')}>{String(d).padStart(2, '0')}</option>
                      ))}
                    </select>
                    <select
                      className="form-input-custom font-medium px-2"
                      value={(recipientInput.headOfFamilyDob || "").split('/')[1] || ""}
                      onChange={(e) => {
                        const [d = "", , y = ""] = (recipientInput.headOfFamilyDob || "").split('/');
                        setRecipientInput({ ...recipientInput, headOfFamilyDob: `${d}/${e.target.value}/${y}` });
                      }}
                    >
                      <option value="">Bulan</option>
                      {['01','02','03','04','05','06','07','08','09','10','11','12'].map((m, i) => {
                        const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
                        return <option key={m} value={m}>{months[i]}</option>
                      })}
                    </select>
                    <select
                      className="form-input-custom font-medium px-2"
                      value={(recipientInput.headOfFamilyDob || "").split('/')[2] || ""}
                      onChange={(e) => {
                        const [d = "", m = ""] = (recipientInput.headOfFamilyDob || "").split('/');
                        setRecipientInput({ ...recipientInput, headOfFamilyDob: `${d}/${m}/${e.target.value}` });
                      }}
                    >
                      <option value="">Tahun</option>
                      {Array.from({length: 120}, (_, i) => new Date().getFullYear() - i).map(y => (
                        <option key={y} value={String(y)}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>

              </div>
              </div>

              {/* SECTION: KONTAK & ALAMAT */}
              <div className="space-y-4 pt-4">
                <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
                  <MapPinned className="h-5 w-5 text-indigo-600" />
                  <h4 className="text-base font-bold text-slate-800">Kontak & Alamat</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-5">
                  <div className="space-y-2 lg:col-span-2 xl:col-span-2">
                    <label className="text-sm font-semibold text-slate-700">
                      No Handphone
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Phone className="h-4 w-4 text-slate-400" />
                      </div>
                      <input
                        type="tel"
                        placeholder="+62"
                        className="form-input-custom font-medium pl-10"
                        value={recipientInput.contact}
                        onChange={(e) => {
                          let val = e.target.value.replace(/[^\d+]/g, "");
                          if (val.startsWith("0")) {
                            val = "+62" + val.substring(1);
                          } else if (val.startsWith("62")) {
                            val = "+" + val;
                          }
                          setRecipientInput({ ...recipientInput, contact: val });
                        }}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2 lg:col-span-2 xl:col-span-2">
                    <label className="text-sm font-semibold text-slate-700">
                      Alamat Lengkap (Jl, RT/RW) *
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                          <MapPin className="h-4 w-4 text-slate-400" />
                        </div>
                        <input
                          type="text"
                          className="form-input-custom font-medium pl-10"
                          value={recipientInput.address}
                          onChange={(e) =>
                            setRecipientInput({
                              ...recipientInput,
                              address: e.target.value,
                            })
                          }
                          placeholder="Jalan"
                        />
                      </div>
                      <div className="w-16">
                        <input
                          type="text"
                          maxLength={3}
                          className="form-input-custom font-mono text-center px-1"
                          value={recipientInput.rt}
                          onChange={(e) =>
                            setRecipientInput({
                              ...recipientInput,
                              rt: e.target.value.replace(/\D/g, ""),
                            })
                          }
                          placeholder="RT"
                        />
                      </div>
                      <div className="w-16">
                        <input
                          type="text"
                          maxLength={3}
                          className="form-input-custom font-mono text-center px-1"
                          value={recipientInput.rw}
                          onChange={(e) =>
                            setRecipientInput({
                              ...recipientInput,
                              rw: e.target.value.replace(/\D/g, ""),
                            })
                          }
                          placeholder="RW"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 lg:col-span-2 xl:col-span-2">
                    <label className="text-sm font-semibold text-slate-700">
                      Kampung / Kelurahan
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <MapPin className="h-4 w-4 text-slate-400" />
                      </div>
                      <input
                        list="kampung-list"
                        className="form-input-custom font-medium pl-9"
                        value={recipientInput.kampung}
                      onChange={(e) => {
                        const selectedKampung = e.target.value;
                        let detectedDistrict = recipientInput.district;

                        for (const [district, villages] of Object.entries(
                          SIAK_REGIONAL_DATA,
                        )) {
                          if (villages.includes(selectedKampung)) {
                            detectedDistrict = district;
                            break;
                          }
                        }
                        setRecipientInput({
                          ...recipientInput,
                          kampung: selectedKampung,
                          district: detectedDistrict,
                        });
                      }}
                      placeholder="Pilih atau ketik Kampung..."
                    />
                    <datalist id="kampung-list">
                      {recipientInput.district && SIAK_REGIONAL_DATA[recipientInput.district as keyof typeof SIAK_REGIONAL_DATA]
                        ? SIAK_REGIONAL_DATA[recipientInput.district as keyof typeof SIAK_REGIONAL_DATA].map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))
                        : Object.entries(SIAK_REGIONAL_DATA).map(
                            ([district, villages]) => (
                              <React.Fragment key={district}>
                                {villages.map((v) => (
                                  <option key={v} value={v}>
                                    {v} - {district}
                                  </option>
                                ))}
                              </React.Fragment>
                            ),
                          )}
                    </datalist>
                    </div>
                  </div>
                  <div className="space-y-2 lg:col-span-2 xl:col-span-2">
                    <label className="text-sm font-semibold text-slate-700">
                      Kecamatan *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Map className="h-4 w-4 text-slate-400" />
                      </div>
                      <input
                        list="kecamatan-list"
                        required
                        className="form-input-custom font-medium pl-9"
                        value={recipientInput.district}
                      onChange={(e) =>
                        setRecipientInput({
                          ...recipientInput,
                          district: e.target.value,
                          kampung: "",
                        })
                      }
                      placeholder="Pilih atau ketik Kecamatan..."
                    />
                    <datalist id="kecamatan-list">
                      {Object.keys(SIAK_REGIONAL_DATA).map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </datalist>
                    </div>
                  </div>
                </div>
              </div>

              {/* STATUS & UNGGAH BERKAS BLOK */}
              <div className="pt-6 space-y-4">
                <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
                  <FolderCheck className="h-5 w-5 text-indigo-600" />
                  <h4 className="text-base font-bold text-slate-800">Administrasi & Berkas</h4>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-slate-50 p-5 rounded-2xl border border-slate-100 items-start">
                    
                    <div className="space-y-5">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 tracking-wider block">
                          Status Berkas Saat ini *
                        </label>
                        <select
                          className="form-input-custom font-medium bg-white border-indigo-200"
                          value={recipientInput.documentStatus || "Lengkap"}
                          onChange={(e) =>
                            setRecipientInput({
                              ...recipientInput,
                              documentStatus: e.target.value,
                              documentStatusNotes:
                                e.target.value === "Lengkap"
                                  ? ""
                                  : recipientInput.documentStatusNotes,
                            })
                          }
                        >
                          <option value="Lengkap">Lengkap</option>
                          <option value="Tidak Lengkap">Tidak Lengkap</option>
                        </select>
                      </div>

                      {recipientInput.documentStatus === "Tidak Lengkap" && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                          <label className="text-sm font-semibold text-rose-700 tracking-wider block">
                            Keterangan Tidak Lengkap *
                          </label>
                          <input
                            required
                            type="text"
                            placeholder="Contoh: Kurang fotokopi KK / KTP buram"
                            className="form-input-custom font-medium bg-white border-rose-300 focus:border-rose-500 focus:ring-rose-500/20 w-full"
                            value={recipientInput.documentStatusNotes || ""}
                            onChange={(e) =>
                              setRecipientInput({
                                ...recipientInput,
                                documentStatusNotes: e.target.value,
                              })
                            }
                          />
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700 tracking-wider block mb-1">
                         Unggah Berkas Persyaratan Utama
                      </label>
                      <div className="mt-1">
                        {documentSlots.slice(0, 1).map((slot, idx) => (
                           <div 
                             key={idx} 
                             onDragEnter={handleDrag}
                             onDragLeave={handleDrag}
                             onDragOver={handleDrag}
                             onDrop={(e) => handleDrop(e, idx)}
                             className={cn(
                               "rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-all w-full relative overflow-hidden group bg-white", 
                               dragActive ? "border-indigo-400 bg-indigo-50" : slot.file ? "border-emerald-300 bg-emerald-50/50" : "border-slate-300 hover:bg-slate-50 hover:border-slate-400"
                             )} 
                             style={{ minHeight: '140px' }}
                           >
                             {slot.file ? (
                                <div className="flex flex-col items-center justify-center p-4 w-full h-full text-center">
                                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 mb-3">
                                   {slot.file.type === "pdf" ? <FileText className="w-6 h-6 text-rose-500" /> : slot.file.type === "excel" ? <FileText className="w-6 h-6 text-emerald-600" /> : <ImageIcon className="w-6 h-6 text-indigo-500" />}
                                  </div>
                                  <p className="text-sm font-bold text-slate-800 truncate w-full max-w-[220px]" title={slot.file.name}>{slot.file.name}</p>
                                  <p className="text-xs font-medium text-slate-500 mt-1">{slot.file.size}</p>
                                  <div className="flex items-center gap-2 mt-4 z-10">
                                     <button type="button" onClick={() => handleOpenPreview(slot.label, slot.file!.url)} className="px-4 py-2 text-xs font-bold bg-white hover:bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm" title="Lihat">
                                       <Eye className="w-4 h-4" /> Lihat
                                     </button>
                                     <button type="button" onClick={() => handleRemoveFileForSlot(idx)} className="px-4 py-2 text-xs font-bold bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm" title="Hapus">
                                       <X className="w-4 h-4" /> Hapus
                                     </button>
                                  </div>
                                </div>
                             ) : (
                                <>
                                  <button type="button" onClick={() => triggerUploadForSlot(idx)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" aria-label="Upload Berkas"></button>
                                  <div className="flex flex-col items-center justify-center p-4 text-center pointer-events-none">
                                    <div className={cn("flex items-center justify-center w-14 h-14 rounded-full mb-3 transition-colors", dragActive ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-500")}>
                                      <Upload className="w-7 h-7" />
                                    </div>
                                    <p className="text-sm font-bold text-slate-700">Tarik & Lepas berkas di sini</p>
                                    <p className="text-xs font-medium text-slate-500 mt-1">atau <span className="text-indigo-600">klik untuk mencari</span></p>
                                    <p className="text-[10px] text-slate-400 mt-2 font-mono bg-slate-100 px-2 py-1 rounded">Mendukung: JPG, PNG, PDF, Excel (Maks 1MB)</p>
                                  </div>
                                </>
                             )}
                           </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hidden Input File node referenced globally */}
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileChange}
                accept="image/*,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              />

              {/* ACTIONS ADD/CANCEL FOR SUB RECIPIENT */}
              <div className="flex justify-end gap-3 mt-4">
                {editingIndex !== null && (
                  <button
                    type="button"
                    onClick={handleCancelEditRecipient}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-all cursor-pointer w-full sm:w-auto"
                  >
                    Batalkan Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAddRecipientToSubTable}
                  disabled={isAddingToSub}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all shadow-sm select-none w-full sm:w-auto",
                    editingIndex !== null
                      ? "bg-amber-500 text-white hover:bg-amber-600 shadow-amber-100 cursor-pointer"
                      : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100 cursor-pointer",
                    isAddingToSub ? "opacity-75 cursor-not-allowed" : "",
                  )}
                >
                  {editingIndex !== null ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Simpan Perubahan</span>
                    </>
                  ) : (
                    <>
                      {isAddingToSub ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      <span>
                        {isAddingToSub
                          ? "Memproses..."
                          : "Tambahkan Penerima"}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: FORM TANDA TERIMA DAN FORMULIR PERMOHONAN BANTUAN */}
        {currentStep === 3 && (
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm animate-in fade-in duration-300">
            <div className="flex items-center gap-2.5 mb-4 pb-2 border-b border-slate-100/80">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base">
                  Penerbitan Tanda Terima & Formulir Permohonan Bantuan
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Tentukan apakah Form Tanda Terima dan Formulir Permohonan Bantuan akan diterbitkan secara otomatis untuk perorangan penerima manfaat.
                </p>
              </div>
            </div>

            <div className="space-y-6">
              
              <h4 className="text-sm font-bold text-indigo-700">
                Parameter Registrasi Aktif: {registrationData.registrationId}
              </h4>

              {/* CHECKLIST & MEDICAL BLOK - DYNAMIC STEP 3 */}
              {[
                { isSavedGroup: false, rData: registrationData, subs: subRecipients, sIdx: -1 },
                ...savedGroups.map((g, i) => ({ isSavedGroup: true, rData: g.registrationData, subs: g.subRecipients, sIdx: i }))
              ].map((cfg, cIdx) => {
                if (!cfg.subs || cfg.subs.length === 0) return null;

                const docs = getDefaultDocuments(cfg.rData.programName || '', cfg.rData.aidType || '');

                return (
                  <div key={cIdx} className="space-y-6 mb-8">
                    {cfg.isSavedGroup && (
                      <h4 className="text-sm font-bold text-indigo-700 border-b border-indigo-100 pb-2">
                        Parameter Registrasi Tersimpan: {cfg.rData.registrationId}
                      </h4>
                    )}

                    <div className="space-y-6">
                      {cfg.subs.map((sub: any, idx: number) => (
                        <div key={idx} className="space-y-6">
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <h5 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                              <FileCheck className="w-4 h-4 text-indigo-600" /> 
                              Validasi Kelengkapan Berkas ({cfg.rData.programName || '-'}) - <span className="capitalize">{(sub.name || "(Tanpa Nama)").toLowerCase()}</span>
                            </h5>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                              {docs.map((docName) => (
                                <label key={docName} className="flex items-start gap-2 text-sm text-slate-700 font-medium cursor-pointer hover:text-indigo-700 transition-colors">
                                  <input 
                                    type="checkbox" 
                                    className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 mt-0.5 border-slate-300 transition-all cursor-pointer" 
                                    checked={(sub.documentChecklist || []).includes(docName)}
                                    onChange={(e) => {
                                      const isChecked = e.target.checked;
                                      let newDocs = [...(sub.documentChecklist || [])];
                                      if (isChecked) {
                                        newDocs.push(docName);
                                      } else {
                                        newDocs = newDocs.filter((d: string) => d !== docName);
                                      }

                                      if (cfg.isSavedGroup) {
                                        const updatedGroups = [...savedGroups];
                                        updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, documentChecklist: newDocs };
                                        setSavedGroups(updatedGroups);
                                      } else {
                                        const updated = [...subRecipients];
                                        updated[idx] = { ...sub, documentChecklist: newDocs };
                                        setSubRecipients(updated);
                                      }
                                    }}
                                  />
                                  <span className="leading-tight">{docName}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          {(cfg.rData.sector === 'Siak Sehat' || cfg.rData.sector === 'Siak Peduli') && (
                            <div className="bg-slate-50/50 p-4 border border-slate-200 rounded-xl">
                              <div className="flex flex-col mb-4">
                                <h4 className="text-sm font-bold text-rose-600 flex items-center gap-2 mb-1">
                                  <Stethoscope className="w-4 h-4" /> Detail Medis & Khusus ({cfg.rData.sector})
                                </h4>
                            <p className="text-sm font-semibold text-black">
                              No Reg: {sub.registrationId || cfg.rData.registrationId} • Penerima: <span className="capitalize">{(sub.name || "(Tanpa Nama)").toLowerCase()}</span>
                            </p>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="space-y-2">
                              <label className="text-sm font-semibold text-slate-700">Pekerjaan *</label>
                              <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <User className="h-4 w-4 text-slate-400" />
                                </div>
                                <input
                                  list={`pekerjaan-list-${cIdx}-${idx}`}
                                  required
                                  className="form-input-custom pl-9"
                                  value={sub.job || ''}
                                  onChange={(e) => {
                                    if (cfg.isSavedGroup) {
                                      const updatedGroups = [...savedGroups];
                                      updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, job: e.target.value };
                                      setSavedGroups(updatedGroups);
                                    } else {
                                      const updated = [...subRecipients];
                                      updated[idx] = { ...sub, job: e.target.value };
                                      setSubRecipients(updated);
                                    }
                                  }}
                                  placeholder="Pilih atau ketik Pekerjaan..."
                                />
                                <datalist id={`pekerjaan-list-${cIdx}-${idx}`}>
                                  {JOB_OPTIONS.map((jobOpt) => (
                                    <option key={jobOpt} value={jobOpt}>{jobOpt.replace(/_/g, ' ')}</option>
                                  ))}
                                </datalist>
                              </div>
                            </div>
                            
                            <div className="space-y-2">
                              <label className="text-sm font-semibold text-slate-700">Kondisi Fisik *</label>
                              <select
                                required
                                className="form-input-custom"
                                value={sub.physicalCondition || ''}
                                onChange={(e) => {
                                  if (cfg.isSavedGroup) {
                                    const updatedGroups = [...savedGroups];
                                    updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, physicalCondition: e.target.value as any };
                                    setSavedGroups(updatedGroups);
                                  } else {
                                    const updated = [...subRecipients];
                                    updated[idx] = { ...sub, physicalCondition: e.target.value as any };
                                    setSubRecipients(updated);
                                  }
                                }}
                              >
                                <option value="">Pilih</option>
                                <option value="Sehat">Sehat</option>
                                <option value="Sakit">Sakit</option>
                                <option value="Cacat">Cacat</option>
                              </select>
                            </div>

                            {!(cfg.rData.sector === 'Siak Peduli' && cfg.rData.programName?.toLowerCase().includes('biaya hidup')) && (
                              <>
                                {!cfg.rData.programName?.toLowerCase().includes('alat kesehatan') && (
                                  <div className="space-y-2">
                                    {cfg.rData.programName?.toLowerCase().includes('transportasi pasien') ? (
                                      <>
                                        <label className="text-sm font-semibold text-slate-700">Tanggal Berangkat *</label>
                                        <input
                                          required
                                          type="date"
                                          className="form-input-custom"
                                          value={sub.departureDate || sub.treatmentStart || ''}
                                          onChange={(e) => {
                                            if (cfg.isSavedGroup) {
                                              const updatedGroups = [...savedGroups];
                                              updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, departureDate: e.target.value, treatmentStart: e.target.value };
                                              setSavedGroups(updatedGroups);
                                            } else {
                                              const updated = [...subRecipients];
                                              updated[idx] = { ...sub, departureDate: e.target.value, treatmentStart: e.target.value };
                                              setSubRecipients(updated);
                                            }
                                          }}
                                        />
                                      </>
                                    ) : (
                                      <>
                                        <label className="text-sm font-semibold text-slate-700">Mulai Dirawat *</label>
                                        <input
                                          required
                                          type="date"
                                          className="form-input-custom"
                                          value={sub.treatmentStart || sub.departureDate || ''}
                                          onChange={(e) => {
                                            if (cfg.isSavedGroup) {
                                              const updatedGroups = [...savedGroups];
                                              updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, treatmentStart: e.target.value, departureDate: e.target.value };
                                              setSavedGroups(updatedGroups);
                                            } else {
                                              const updated = [...subRecipients];
                                              updated[idx] = { ...sub, treatmentStart: e.target.value, departureDate: e.target.value };
                                              setSubRecipients(updated);
                                            }
                                          }}
                                        />
                                      </>
                                    )}
                                  </div>
                                )}

                                <div className="space-y-2">
                                  <label className="text-sm font-semibold text-slate-700">Diagnosa Penyakit *</label>
                                  <input
                                    required
                                    type="text"
                                    className="form-input-custom"
                                    value={sub.diagnosis || ''}
                                    onChange={(e) => {
                                      if (cfg.isSavedGroup) {
                                        const updatedGroups = [...savedGroups];
                                        updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, diagnosis: e.target.value };
                                        setSavedGroups(updatedGroups);
                                      } else {
                                        const updated = [...subRecipients];
                                        updated[idx] = { ...sub, diagnosis: e.target.value };
                                        setSubRecipients(updated);
                                      }
                                    }}
                                    onBlur={(e) => handleAddDisease(e.target.value)}
                                    list={`disease-list-${cIdx}-${idx}`}
                                  />
                                  <datalist id={`disease-list-${cIdx}-${idx}`}>
                                    {diseaseOptions.map((opt) => (
                                      <option key={opt} value={opt} />
                                    ))}
                                  </datalist>
                                </div>

                                <div className="space-y-2">
                                  <label className="text-sm font-semibold text-slate-700">Nama Rumah Sakit *</label>
                                  <input
                                    required
                                    type="text"
                                    className="form-input-custom"
                                    value={sub.hospitalName || ''}
                                    onChange={(e) => {
                                      if (cfg.isSavedGroup) {
                                        const updatedGroups = [...savedGroups];
                                        updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, hospitalName: e.target.value };
                                        setSavedGroups(updatedGroups);
                                      } else {
                                        const updated = [...subRecipients];
                                        updated[idx] = { ...sub, hospitalName: e.target.value };
                                        setSubRecipients(updated);
                                      }
                                    }}
                                    onBlur={(e) => handleAddHospital(e.target.value)}
                                    list={`hospital-list-${cIdx}-${idx}`}
                                  />
                                  <datalist id={`hospital-list-${cIdx}-${idx}`}>
                                    {hospitalOptions.map((opt) => (
                                      <option key={opt} value={opt} />
                                    ))}
                                  </datalist>
                                </div>

                                <div className="space-y-2">
                                  <label className="text-sm font-semibold text-slate-700">Nama Pendamping/Yg Dirawat *</label>
                                  <input
                                    required
                                    type="text"
                                    className="form-input-custom"
                                    value={sub.patientCompanionName || ''}
                                    onChange={(e) => {
                                      if (cfg.isSavedGroup) {
                                        const updatedGroups = [...savedGroups];
                                        updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, patientCompanionName: e.target.value };
                                        setSavedGroups(updatedGroups);
                                      } else {
                                        const updated = [...subRecipients];
                                        updated[idx] = { ...sub, patientCompanionName: e.target.value };
                                        setSubRecipients(updated);
                                      }
                                    }}
                                  />
                                </div>
                              </>
                            )}

                            {cfg.rData.programName?.toLowerCase().includes('pendamping pasien') && (
                              <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Jumlah Hari (Pendampingan) *</label>
                                <input
                                  required
                                  type="number"
                                  className="form-input-custom"
                                  placeholder="e.g. 3"
                                  value={sub.daysCount || ''}
                                  onChange={(e) => {
                                    if (cfg.isSavedGroup) {
                                      const updatedGroups = [...savedGroups];
                                      updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, daysCount: parseInt(e.target.value) || 0 };
                                      setSavedGroups(updatedGroups);
                                    } else {
                                      const updated = [...subRecipients];
                                      updated[idx] = { ...sub, daysCount: parseInt(e.target.value) || 0 };
                                      setSubRecipients(updated);
                                    }
                                  }}
                                />
                              </div>
                            )}

                            {cfg.rData.programName?.toLowerCase().includes('alat kesehatan') && (
                              <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Nama Alat Kesehatan *</label>
                                <input
                                  required
                                  type="text"
                                  className="form-input-custom"
                                  placeholder="e.g. Kursi Roda"
                                  value={sub.healthToolName || ''}
                                  onChange={(e) => {
                                    if (cfg.isSavedGroup) {
                                      const updatedGroups = [...savedGroups];
                                      updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, healthToolName: e.target.value };
                                      setSavedGroups(updatedGroups);
                                    } else {
                                      const updated = [...subRecipients];
                                      updated[idx] = { ...sub, healthToolName: e.target.value };
                                      setSubRecipients(updated);
                                    }
                                  }}
                                />
                              </div>
                            )}

                            <div className="space-y-2">
                              <label className="text-sm font-semibold text-slate-700">Jumlah Bantuan (Untuk Formulir Saja) *</label>
                              <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <span className="text-slate-500 font-bold font-mono text-sm">Rp</span>
                                </div>
                                <input
                                  required
                                  type="text"
                                  className="form-input-custom font-mono pl-9"
                                  placeholder="0"
                                  value={sub.receiptAmount ? Number(sub.receiptAmount).toLocaleString("id-ID") : ""}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, "");
                                    if (cfg.isSavedGroup) {
                                      const updatedGroups = [...savedGroups];
                                      updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, receiptAmount: val };
                                      setSavedGroups(updatedGroups);
                                    } else {
                                      const updated = [...subRecipients];
                                      updated[idx] = { ...sub, receiptAmount: val };
                                      setSubRecipients(updated);
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

              {subRecipients.length === 0 ? (
                <div className="p-10 text-center space-y-2 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  <p className="text-slate-400 font-bold text-sm">
                    Belum Ada Penerima dalam Sub-Tabel
                  </p>
                  <p className="text-slate-400 text-xs max-w-md mx-auto">
                    Silakan kembalilah ke langkah sebelumnya untuk menginput penerima manfaat minimal 1 orang terlebih dahulu.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto bg-slate-50/50 rounded-xl border border-slate-200">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-100/80 text-slate-700 text-xs font-semibold">
                      <tr>
                        <th className="px-3.5 py-3 text-center border-r border-slate-200 w-12 font-bold">
                          No
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap text-center">
                          Cetak Tanda Terima
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          No Reg
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          Nama Penerima
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          Bantuan Untuk
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          NIK
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          Nomor KK
                        </th>
                        <th className="px-3 py-3 font-bold whitespace-nowrap">
                          Alamat
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {[
                        { isSavedGroup: false, rData: registrationData, subs: subRecipients, sIdx: -1 },
                        ...savedGroups.map((g, i) => ({ isSavedGroup: true, rData: g.registrationData, subs: g.subRecipients, sIdx: i }))
                      ].map((cfg, cIdx) => (
                        <React.Fragment key={cIdx}>
                          {cfg.subs.map((sub: any, idx: number) => {
                            const currentIdx = cIdx === 0 
                              ? idx 
                              : subRecipients.length + savedGroups.slice(0, cIdx - 1).reduce((acc, g) => acc + g.subRecipients.length, 0) + idx;
                            return (
                              <tr
                                key={`${cIdx}-${idx}`}
                                className="hover:bg-slate-50/60 transition-colors text-black font-normal"
                              >
                                <td className="px-3.5 py-4 text-center border-r border-slate-200/40 text-xs font-mono">
                                  {currentIdx + 1}
                                </td>
                                <td className="px-3 py-4 text-center border-r border-slate-200/40">
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-600 cursor-pointer"
                                    checked={sub.isReceiptGenerated !== false}
                                    onChange={(e) => {
                                      if (cfg.isSavedGroup) {
                                        const updatedGroups = [...savedGroups];
                                        updatedGroups[cfg.sIdx].subRecipients[idx] = {
                                          ...sub,
                                          isReceiptGenerated: e.target.checked
                                        };
                                        setSavedGroups(updatedGroups);
                                      } else {
                                        const updated = [...subRecipients];
                                        updated[idx] = {
                                          ...sub,
                                          isReceiptGenerated: e.target.checked,
                                        };
                                        setSubRecipients(updated);
                                      }
                                    }}
                                  />
                                </td>
                                <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap">
                                  {sub.registrationId || cfg.rData.registrationId || "-"}
                                </td>
                                <td className="px-3 py-4 border-r border-slate-200/40 font-bold text-black capitalize whitespace-nowrap">
                                  {(sub.name || "(Tanpa Nama)").toLowerCase()}
                                </td>
                                <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap">
                                  {sub.programName || cfg.rData.programName || "-"}
                                </td>
                                <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap">
                                  {sub.nik}
                                </td>
                                <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap">
                                  {sub.kk}
                                </td>
                                <td className="px-3 py-4 text-black truncate max-w-[200px]" title={`${sub.address}, ${sub.kampung}, ${sub.district}`}>
                                  {sub.address}, {sub.kampung}, {sub.district}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {savedGroups.length > 0 && (
              <div className="space-y-4 pt-6 mt-6 border-t border-slate-100">
                <h4 className="text-sm font-bold text-slate-700">Daftar Parameter Registrasi Tersimpan</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {savedGroups.map((group, idx) => (
                    <div key={idx} className="relative group/card">
                      <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:border-slate-300 transition-colors h-full">
                        <input
                          type="checkbox"
                          checked={group.printGroup !== false}
                          onChange={(e) => {
                            const updated = [...savedGroups];
                            updated[idx] = { ...group, printGroup: e.target.checked };
                            setSavedGroups(updated);
                          }}
                          className="mt-1 w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-600 cursor-pointer flex-shrink-0"
                        />
                        <div className="flex-1 pr-6">
                          <h5 className="font-bold text-slate-800 text-sm leading-tight mb-1">
                            {group.registrationData.registrationId}
                          </h5>
                          <p className="text-xs text-slate-500 line-clamp-2">
                            {group.registrationData.programName}
                          </p>
                          <p className="text-xs font-bold text-indigo-600 mt-2">
                            {group.subRecipients.length} Penerima
                          </p>
                        </div>
                      </label>
                      <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-all">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            handleEditSavedGroup(idx);
                          }}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all rounded-lg"
                          title="Sunting Parameter & Data Penerima"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            if(confirm("Hapus kelompok draf ini?")) {
                              handleDeleteSavedGroup(idx);
                            }
                          }}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all rounded-lg"
                          title="Hapus kelompok draf"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between pt-6 mt-6 border-t border-slate-100 gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {onMassReceipt && (subRecipients.length > 0 || savedGroups.length > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      const mockIdPrefix = Array.isArray(initialGroupRecipients) 
                        ? initialGroupRecipients[0]?.registrationId?.split('-')[0] + '-' + (Math.floor(Math.random() * 900) + 100) 
                        : 'TBD-'+Math.floor(Math.random() * 9999);
                        
                      const activeGroupPayload = subRecipients.length > 0 ? [{ registrationData, subRecipients }] : [];
                      
                      const recipientsToPrint = [...savedGroups.filter(g => g.printGroup !== false), ...activeGroupPayload]
                        .filter(group => group.subRecipients && group.subRecipients.length > 0)
                        .flatMap((group, i) => {
                            return group.subRecipients
                                .filter((sub: any) => sub.isReceiptGenerated !== false)
                                .map((sub: any, j: number) => ({
                                  ...group.registrationData,
                                  ...sub,
                                  tujuanPengajuan: group.registrationData.tujuanPengajuan || sub.tujuanPengajuan,
                                  tujuanPenyaluranMPZIS: group.registrationData.tujuanPenyaluranMPZIS || sub.tujuanPenyaluranMPZIS,
                                  budgetCode: group.registrationData.budgetCode || sub.budgetCode,
                                  budgetName: group.registrationData.budgetName || sub.budgetName,
                                  transactionType: group.registrationData.transactionType || sub.transactionType,
                                  id: sub.id || `${mockIdPrefix}-${i}-${j}`,
                                  registrationId: group.registrationData.registrationId || `${mockIdPrefix}-${i}`,
                                }));
                        });
                      onMassReceipt(recipientsToPrint as Recipient[]);
                    }}
                    className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-bold text-sm px-6 py-2.5 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    Cetak Tanda Terima
                  </button>
                )}
                
                <button
                   type="button"
                   onClick={handleAddAdditionalParameter}
                   className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-sm px-6 py-2.5 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                >
                   <Plus className="w-4 h-4" />
                   Tambah Parameter Registrasi
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4: FORM MPZIS DAN E-PPD */}
        {currentStep === 4 && (
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm animate-in fade-in duration-300">
            <div className="flex items-center gap-2.5 mb-4 pb-2 border-b border-slate-100/80">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base">
                  Penerbitan Dokumen MPZIS & E-PPD
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Tentukan apakah dokumen MPZIS dan E-PPD akan diterbitkan secara otomatis untuk perorangan penerima manfaat.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {[
                { isSavedGroup: false, rData: registrationData, subs: subRecipients, sIdx: -1 },
                ...savedGroups.map((g, i) => ({ isSavedGroup: true, rData: g.registrationData, subs: g.subRecipients, sIdx: i }))
              ].map((cfg, cIdx) => {
                if (!cfg.subs || cfg.subs.length === 0) return null;

                return (
                  <div key={cIdx} className="space-y-6 mb-8">
                    {cfg.isSavedGroup && (
                      <h4 className="text-sm font-bold text-indigo-700 border-b border-indigo-100 pb-2">
                        Parameter Registrasi Tersimpan: {cfg.rData.registrationId}
                      </h4>
                    )}

                    {/* E-PPD Group Fields */}
                    <div className="p-5 rounded-2xl border border-blue-200 bg-blue-50/60 shadow-sm mb-6">
                      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-blue-100">
                        <FileText className="w-5 h-5 text-blue-600" />
                        <h4 className="text-sm font-bold text-blue-800 uppercase tracking-widest">Parameter E-PPD</h4>
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold ml-auto">Berlaku untuk {cfg.subs.length} Penerima</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-slate-600 uppercase">Tujuan Pengajuan E-PPD</label>
                              <button
                                type="button"
                                onClick={() => {
                                  const bulan = new Date().toLocaleString("id-ID", { month: "long" });
                                  const generated = `Permohonan Pencairan Dana ${cfg.rData.fundingSource || ""} ${cfg.rData.programName || ""} Sebanyak ${cfg.subs.length} Orang Bulan ${bulan}`.trim().replace(/\s+/g, " ");
                                  if (cfg.isSavedGroup) {
                                    const updatedGroups = [...savedGroups];
                                    updatedGroups[cfg.sIdx].registrationData = { ...updatedGroups[cfg.sIdx].registrationData, tujuanPengajuan: generated };
                                    setSavedGroups(updatedGroups);
                                  } else {
                                    setRegistrationData(prev => ({ ...prev, tujuanPengajuan: generated }));
                                  }
                                }}
                                className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 active:scale-95 duration-100 transition-colors cursor-pointer"
                              >
                                <Wand2 className="w-3 h-3" /> Buat Otomatis
                              </button>
                            </div>
                            <textarea
                              className="form-input-custom min-h-[60px] font-medium bg-white"
                              value={cfg.rData.tujuanPengajuan || ""}
                              onChange={(e) => {
                                if (cfg.isSavedGroup) {
                                  const updatedGroups = [...savedGroups];
                                  updatedGroups[cfg.sIdx].registrationData = { ...updatedGroups[cfg.sIdx].registrationData, tujuanPengajuan: e.target.value };
                                  setSavedGroups(updatedGroups);
                                } else {
                                  setRegistrationData(prev => ({ ...prev, tujuanPengajuan: e.target.value }));
                                }
                              }}
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-600 uppercase">Tujuan Penyaluran MPZIS</label>
                            <input
                              type="text"
                              className="form-input-custom font-medium bg-white"
                              placeholder={`Melaksanakan Program ${cfg.rData.programName || ""}`}
                              value={cfg.rData.tujuanPenyaluranMPZIS || ""}
                              onChange={(e) => {
                                if (cfg.isSavedGroup) {
                                  const updatedGroups = [...savedGroups];
                                  updatedGroups[cfg.sIdx].registrationData = { ...updatedGroups[cfg.sIdx].registrationData, tujuanPenyaluranMPZIS: e.target.value };
                                  setSavedGroups(updatedGroups);
                                } else {
                                  setRegistrationData(prev => ({ ...prev, tujuanPenyaluranMPZIS: e.target.value }));
                                }
                              }}
                            />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-slate-600 uppercase">Kode Anggaran</label>
                              <select
                                className="form-input-custom font-medium truncate bg-white"
                                value={cfg.rData.budgetCode || ""}
                                onChange={(e) => {
                                  const selectedCode = e.target.value;
                                  const foundBudget = BUDGET_OPTIONS.find(b => b.code === selectedCode);
                                  const newName = foundBudget ? foundBudget.name : "";
                                  
                                  if (cfg.isSavedGroup) {
                                    const updatedGroups = [...savedGroups];
                                    updatedGroups[cfg.sIdx].registrationData = { 
                                      ...updatedGroups[cfg.sIdx].registrationData, 
                                      budgetCode: selectedCode,
                                      budgetName: newName
                                    };
                                    setSavedGroups(updatedGroups);
                                  } else {
                                    setRegistrationData(prev => ({ 
                                      ...prev, 
                                      budgetCode: selectedCode,
                                      budgetName: newName
                                    }));
                                  }
                                }}
                              >
                                <option value="">Pilih Kode Anggaran</option>
                                {BUDGET_OPTIONS.map((b) => (
                                  <option key={b.code} value={b.code} className="truncate">
                                    {b.code} - {b.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-slate-600 uppercase">Nama Anggaran</label>
                              <input
                                type="text"
                                className="form-input-custom font-medium bg-white"
                                value={cfg.rData.budgetName || ""}
                                placeholder="Otomatis terisi..."
                                onChange={(e) => {
                                  if (cfg.isSavedGroup) {
                                    const updatedGroups = [...savedGroups];
                                    updatedGroups[cfg.sIdx].registrationData = { ...updatedGroups[cfg.sIdx].registrationData, budgetName: e.target.value };
                                    setSavedGroups(updatedGroups);
                                  } else {
                                    setRegistrationData(prev => ({ ...prev, budgetName: e.target.value }));
                                  }
                                }}
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-600 uppercase">Jenis Transaksi (E-PPD)</label>
                            <select
                              className="form-input-custom font-medium bg-white"
                              value={cfg.rData.transactionType || ""}
                              onChange={(e) => {
                                if (cfg.isSavedGroup) {
                                  const updatedGroups = [...savedGroups];
                                  updatedGroups[cfg.sIdx].registrationData = { ...updatedGroups[cfg.sIdx].registrationData, transactionType: e.target.value };
                                  setSavedGroups(updatedGroups);
                                } else {
                                  setRegistrationData(prev => ({ ...prev, transactionType: e.target.value }));
                                }
                              }}
                            >
                              <option value="">Pilih Transaksi</option>
                              <option value="Uang Muka">Uang Muka</option>
                              <option value="Reimbursment">Reimbursment</option>
                              <option value="Pembayaran">Pembayaran</option>
                              <option value="Piutang Penyaluran">Piutang Penyaluran</option>
                              <option value="Bank Program">Bank Program</option>
                              <option value="Lain-lain">Lain-lain</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      {cfg.subs.map((sub: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col gap-6 hover:border-slate-300 transition-colors"
                        >
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-sm select-none">
                                {idx + 1}
                              </div>
                              <div>
                                <h4 className="font-bold text-black text-sm capitalize">
                                  {(sub.name || "(Tanpa Nama)").toLowerCase()}
                                </h4>
                                <p className="text-black text-xs font-medium">
                                  NIK: {sub.nik} • KK: {sub.kk}
                                </p>
                              </div>
                            </div>
                          </div>

                          <hr className="border-slate-200/60" />

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* PENYALURAN BLOK */}
                            <div className="space-y-4">
                              <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Penyaluran</h4>
                              
                              <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Penerima Dana</label>
                                <input
                                  list={`penerima-dana-list-${cIdx}-${idx}`}
                                  className="form-input-custom font-medium"
                                  placeholder="Ketik atau pilih penerima dana"
                                  value={sub.penerimaDana || ""}
                                  onChange={(e) => {
                                    if (cfg.isSavedGroup) {
                                      const updatedGroups = [...savedGroups];
                                      updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, penerimaDana: e.target.value };
                                      setSavedGroups(updatedGroups);
                                    } else {
                                      const updated = [...subRecipients];
                                      updated[idx] = { ...sub, penerimaDana: e.target.value };
                                      setSubRecipients(updated);
                                    }
                                  }}
                                />
                                <datalist id={`penerima-dana-list-${cIdx}-${idx}`}>
                                  {cfg.rData.institutionName && <option value={cfg.rData.institutionName} />}
                                  {sub.schoolName && <option value={sub.schoolName} />}
                                </datalist>
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Jumlah Bantuan (Rp)</label>
                                <div className="relative">
                                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <span className="text-slate-500 font-bold font-mono text-sm">Rp</span>
                                  </div>
                                  <input
                                    type="text"
                                    className="form-input-custom font-mono pl-9"
                                    placeholder="0"
                                    value={sub.amountProposed ? Number(sub.amountProposed).toLocaleString("id-ID") : ""}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/\D/g, "");
                                      if (cfg.isSavedGroup) {
                                        const updatedGroups = [...savedGroups];
                                        updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, amountProposed: val };
                                        setSavedGroups(updatedGroups);
                                      } else {
                                        const updated = [...subRecipients];
                                        updated[idx] = { ...sub, amountProposed: val };
                                        setSubRecipients(updated);
                                      }
                                    }}
                                  />
                                </div>
                              </div>

                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <label className="text-xs font-bold text-slate-500 uppercase">Uraian MPZIS</label>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const rtRw = [sub.rt, sub.rw].filter(Boolean).join("/");
                                      const alamatLengkap = [sub.address, rtRw].filter(Boolean).join(" ");
                                      const generated = `Permohonan Bantuan ${cfg.rData.programName || cfg.rData.aidType || ""} a.n ${sub.name || ""} Alamat ${alamatLengkap} kampung ${sub.kampung || ""} kecamatan ${sub.district || ""}`.trim().replace(/\s+/g, " ");
                                      if (cfg.isSavedGroup) {
                                        const updatedGroups = [...savedGroups];
                                        updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, purpose: generated };
                                        setSavedGroups(updatedGroups);
                                      } else {
                                        const updated = [...subRecipients];
                                        updated[idx] = { ...sub, purpose: generated };
                                        setSubRecipients(updated);
                                      }
                                    }}
                                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 active:scale-95 duration-100 transition-colors cursor-pointer"
                                  >
                                    <Wand2 className="w-3 h-3" /> Buat Otomatis
                                  </button>
                                </div>
                                <textarea
                                  className="form-input-custom min-h-[60px] font-medium"
                                  placeholder={`Melaksanakan Program ${cfg.rData.programName || ""}`}
                                  value={sub.purpose || ""}
                                  onChange={(e) => {
                                    if (cfg.isSavedGroup) {
                                      const updatedGroups = [...savedGroups];
                                      updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, purpose: e.target.value };
                                      setSavedGroups(updatedGroups);
                                    } else {
                                      const updated = [...subRecipients];
                                      updated[idx] = { ...sub, purpose: e.target.value };
                                      setSubRecipients(updated);
                                    }
                                  }}
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">Jenis Transaksi (MPZIS) <span className="text-red-500">*</span></label>
                                <select
                                  className="form-input-custom font-medium"
                                  required
                                  value={sub.jenisTransaksiMPZIS || ""}
                                    onChange={(e) => {
                                      if (cfg.isSavedGroup) {
                                        const updatedGroups = [...savedGroups];
                                        updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, jenisTransaksiMPZIS: e.target.value as 'Cash' | 'Transfer' };
                                        setSavedGroups(updatedGroups);
                                      } else {
                                        const updated = [...subRecipients];
                                        updated[idx] = { ...sub, jenisTransaksiMPZIS: e.target.value as 'Cash' | 'Transfer' };
                                        setSubRecipients(updated);
                                      }
                                    }}
                                  >
                                    <option value="">Pilih Transaksi</option>
                                    <option value="Cash">Cash</option>
                                    <option value="Transfer">Transfer</option>
                                  </select>
                                </div>
                              </div>

                              {/* PENDIDIKAN & PERBANKAN BLOK */}
                              <div className="space-y-4">
                              <div className="flex items-center space-x-2 border-b border-slate-100 pb-1.5 mt-2">
                                <BookOpen className="h-4 w-4 text-indigo-500" />
                                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Pendidikan (Opsional)</h4>
                              </div>
                              
                              <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Nama Sekolah / Instansi</label>
                                <input
                                  type="text"
                                  className="form-input-custom font-medium"
                                  value={sub.schoolName || ""}
                                  onChange={(e) => {
                                    if (cfg.isSavedGroup) {
                                      const updatedGroups = [...savedGroups];
                                      updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, schoolName: e.target.value };
                                      setSavedGroups(updatedGroups);
                                    } else {
                                      const updated = [...subRecipients];
                                      updated[idx] = { ...sub, schoolName: e.target.value };
                                      setSubRecipients(updated);
                                    }
                                  }}
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-xs font-bold text-slate-500 uppercase">Tingkatan</label>
                                  <input
                                    type="text"
                                    className="form-input-custom font-medium"
                                    value={sub.schoolLevel || ""}
                                    onChange={(e) => {
                                      if (cfg.isSavedGroup) {
                                        const updatedGroups = [...savedGroups];
                                        updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, schoolLevel: e.target.value };
                                        setSavedGroups(updatedGroups);
                                      } else {
                                        const updated = [...subRecipients];
                                        updated[idx] = { ...sub, schoolLevel: e.target.value };
                                        setSubRecipients(updated);
                                      }
                                    }}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-bold text-slate-500 uppercase">Kelas/SMTR</label>
                                  <input
                                    type="text"
                                    className="form-input-custom font-medium"
                                    value={sub.schoolClass || ""}
                                    onChange={(e) => {
                                      if (cfg.isSavedGroup) {
                                        const updatedGroups = [...savedGroups];
                                        updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, schoolClass: e.target.value };
                                        setSavedGroups(updatedGroups);
                                      } else {
                                        const updated = [...subRecipients];
                                        updated[idx] = { ...sub, schoolClass: e.target.value };
                                        setSubRecipients(updated);
                                      }
                                    }}
                                  />
                                </div>
                              </div>

                              <div className="flex items-center space-x-2 border-b border-slate-100 pb-1.5 mt-6 mb-2">
                                <CreditCard className="h-4 w-4 text-emerald-500" />
                                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Rekening Bank (Opsional)</h4>
                              </div>

                              <div className="grid grid-cols-2 gap-3 pt-2">
                                <div className="space-y-1">
                                  <label className="text-xs font-bold text-slate-500 uppercase">Nama Bank</label>
                                  <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                      <Building className="h-3.5 w-3.5 text-slate-400" />
                                    </div>
                                    <input
                                      type="text"
                                      className="form-input-custom font-medium pl-9 text-sm"
                                      value={sub.bankName || ""}
                                    onChange={(e) => {
                                      if (cfg.isSavedGroup) {
                                        const updatedGroups = [...savedGroups];
                                        updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, bankName: e.target.value };
                                        setSavedGroups(updatedGroups);
                                      } else {
                                        const updated = [...subRecipients];
                                        updated[idx] = { ...sub, bankName: e.target.value };
                                        setSubRecipients(updated);
                                      }
                                    }}
                                  />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-bold text-slate-500 uppercase">Nomor Rekening</label>
                                  <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                      <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                                    </div>
                                    <input
                                      type="text"
                                      maxLength={16}
                                      className="form-input-custom font-mono pl-9 text-sm"
                                      value={sub.bankAccountNo || ""}
                                    onChange={(e) => {
                                      if (cfg.isSavedGroup) {
                                        const updatedGroups = [...savedGroups];
                                        updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, bankAccountNo: e.target.value.replace(/\D/g, "") };
                                        setSavedGroups(updatedGroups);
                                      } else {
                                        const updated = [...subRecipients];
                                        updated[idx] = { ...sub, bankAccountNo: e.target.value.replace(/\D/g, "") };
                                        setSubRecipients(updated);
                                      }
                                    }}
                                  />
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Nama Pemilik Rekening</label>
                                <input
                                  type="text"
                                  className="form-input-custom font-medium"
                                  value={sub.bankAccountHolder || ""}
                                  onChange={(e) => {
                                    if (cfg.isSavedGroup) {
                                      const updatedGroups = [...savedGroups];
                                      updatedGroups[cfg.sIdx].subRecipients[idx] = { ...sub, bankAccountHolder: e.target.value };
                                      setSavedGroups(updatedGroups);
                                    } else {
                                      const updated = [...subRecipients];
                                      updated[idx] = { ...sub, bankAccountHolder: e.target.value };
                                      setSubRecipients(updated);
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* TABLE */}
              {subRecipients.length === 0 && savedGroups.length === 0 ? (
                <div className="p-10 text-center space-y-2 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  <p className="text-slate-400 font-bold text-sm">
                    Belum Ada Penerima dalam Sub-Tabel
                  </p>
                  <p className="text-slate-400 text-xs max-w-md mx-auto">
                    Silakan kembalilah ke langkah sebelumnya untuk menginput penerima manfaat minimal 1 orang terlebih dahulu.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200/60 rounded-xl">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-100/50 text-slate-500 uppercase tracking-wider text-[10px]">
                        <th className="px-3.5 py-3 text-center border-r border-slate-200 w-12 font-bold">
                          No
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap text-center">
                          Terbit Form MPZIS
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap text-center">
                          Terbit Form E-PPD
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          No Reg
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          Nama Penerima
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          Bantuan Untuk
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          NIK
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          Nomor KK
                        </th>
                        <th className="px-3 py-3 font-bold whitespace-nowrap">
                          Alamat
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {[
                        { isSavedGroup: false, rData: registrationData, subs: subRecipients, sIdx: -1 },
                        ...savedGroups.map((g, i) => ({ isSavedGroup: true, rData: g.registrationData, subs: g.subRecipients, sIdx: i }))
                      ].map((cfg, cIdx) => (
                        <React.Fragment key={cIdx}>
                          {cfg.subs.map((sub: any, idx: number) => {
                            // Calculate continuous index across groups
                            const currentIdx = cIdx === 0 
                              ? idx 
                              : subRecipients.length + savedGroups.slice(0, cIdx - 1).reduce((acc, g) => acc + g.subRecipients.length, 0) + idx;

                            return (
                              <tr
                                key={`${cIdx}-${idx}`}
                                className="hover:bg-slate-50/60 transition-colors text-black font-normal"
                              >
                                <td className="px-3.5 py-4 text-center border-r border-slate-200/40 text-xs font-mono">
                                  {currentIdx + 1}
                                </td>
                                <td className="px-3 py-4 text-center border-r border-slate-200/40">
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-600 cursor-pointer"
                                    checked={sub.isMPZISGenerated !== false}
                                    onChange={(e) => {
                                      if (cfg.isSavedGroup) {
                                        const updatedGroups = [...savedGroups];
                                        updatedGroups[cfg.sIdx].subRecipients[idx] = {
                                          ...sub,
                                          isMPZISGenerated: e.target.checked,
                                        };
                                        setSavedGroups(updatedGroups);
                                      } else {
                                        const updated = [...subRecipients];
                                        updated[idx] = {
                                          ...sub,
                                          isMPZISGenerated: e.target.checked,
                                        };
                                        setSubRecipients(updated);
                                      }
                                    }}
                                  />
                                </td>
                                <td className="px-3 py-4 text-center border-r border-slate-200/40">
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-600 cursor-pointer"
                                    checked={sub.isEPPDGenerated !== false}
                                    onChange={(e) => {
                                      if (cfg.isSavedGroup) {
                                        const updatedGroups = [...savedGroups];
                                        updatedGroups[cfg.sIdx].subRecipients[idx] = {
                                          ...sub,
                                          isEPPDGenerated: e.target.checked,
                                        };
                                        setSavedGroups(updatedGroups);
                                      } else {
                                        const updated = [...subRecipients];
                                        updated[idx] = {
                                          ...sub,
                                          isEPPDGenerated: e.target.checked,
                                        };
                                        setSubRecipients(updated);
                                      }
                                    }}
                                  />
                                </td>
                                <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap">
                                  {sub.registrationId || cfg.rData.registrationId || "-"}
                                </td>
                                <td className="px-3 py-4 border-r border-slate-200/40 font-bold text-black capitalize whitespace-nowrap">
                                  {(sub.name || "(Tanpa Nama)").toLowerCase()}
                                </td>
                                <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap">
                                  {sub.programName || cfg.rData.programName || "-"}
                                </td>
                                <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap">
                                  {sub.nik}
                                </td>
                                <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap">
                                  {sub.kk}
                                </td>
                                <td className="px-3 py-4 text-black truncate max-w-[200px]" title={`${sub.address}, ${sub.kampung}, ${sub.district}`}>
                                  {sub.address}, {sub.kampung}, {sub.district}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between pt-6 mt-6 border-t border-slate-100 gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {onMassMPZIS && (subRecipients.length > 0 || savedGroups.length > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      const mockIdPrefix = Array.isArray(initialGroupRecipients) 
                        ? initialGroupRecipients[0]?.registrationId?.split('-')[0] + '-' + (Math.floor(Math.random() * 900) + 100) 
                        : 'TBD-'+Math.floor(Math.random() * 9999);
                        
                      const activeGroupPayload = subRecipients.length > 0 ? [{ registrationData, subRecipients }] : [];
                      
                      const recipientsToPrint = [...savedGroups, ...activeGroupPayload]
                        .map((group, i) => {
                            const validChildren = group.subRecipients.filter((sub: any) => sub.isMPZISGenerated !== false);
                            if (validChildren.length === 0) return null;

                            const subForBase = validChildren[0];
                            const totalGrpAmount = validChildren.reduce((sum: number, c: any) => sum + (Number(c.amountProposed) || 0), 0);
                            
                            const dynamicSigners = totalGrpAmount < 5000000 ? [
                              { name: "H. Samparis Bin Tatan, S.Pd.I", role: "Ketua" },
                              { name: "H. Sukijo", role: "Wakil Ketua II" }
                            ] : [
                              { name: "H. Samparis Bin Tatan, S.Pd.I", role: "Ketua" },
                              { name: "Syukron Wahib, M.Pd.I", role: "Wakil Ketua I" },
                              { name: "H. Sukijo", role: "Wakil Ketua II" },
                              { name: "KH. Moch Sowwam Amin, SH", role: "Wakil Ketua III" },
                              { name: "H. Rojikin, S.Ag, MH", role: "Wakil Ketua IV" }
                            ];

                            return {
                                ...group.registrationData,
                                ...subForBase,
                                tujuanPengajuan: group.registrationData.tujuanPengajuan || subForBase.tujuanPengajuan,
                                tujuanPenyaluranMPZIS: group.registrationData.tujuanPenyaluranMPZIS || subForBase.tujuanPenyaluranMPZIS,
                                budgetCode: group.registrationData.budgetCode || subForBase.budgetCode,
                                budgetName: group.registrationData.budgetName || subForBase.budgetName,
                                transactionType: group.registrationData.transactionType || subForBase.transactionType,
                                id: subForBase.id || `${mockIdPrefix}-${i}`,
                                registrationId: group.registrationData.registrationId,
                                signersBottom: dynamicSigners,
                                lampiranItems: validChildren.map((child: any) => ({
                                    ...group.registrationData,
                                    ...child,
                                    tujuanPengajuan: group.registrationData.tujuanPengajuan || child.tujuanPengajuan,
                                    tujuanPenyaluranMPZIS: group.registrationData.tujuanPenyaluranMPZIS || child.tujuanPenyaluranMPZIS,
                                    budgetCode: group.registrationData.budgetCode || child.budgetCode,
                                    budgetName: group.registrationData.budgetName || child.budgetName,
                                    transactionType: group.registrationData.transactionType || child.transactionType,
                                }))
                            };
                        })
                        .filter(Boolean);
                        
                      if (recipientsToPrint.length === 0) {
                        alert("Tidak ada penerima yang dipilih untuk mencetak MPZIS.");
                        return;
                      }

                      onMassMPZIS(recipientsToPrint as any[]);
                    }}
                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-sm px-6 py-2.5 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    Cetak MPZIS
                  </button>
                )}
                {onMassEPPD && (subRecipients.length > 0 || savedGroups.length > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      const mockIdPrefix = Array.isArray(initialGroupRecipients) 
                        ? initialGroupRecipients[0]?.registrationId?.split('-')[0] + '-' + (Math.floor(Math.random() * 900) + 100) 
                        : 'TBD-'+Math.floor(Math.random() * 9999);
                        
                      const activeGroupPayload = subRecipients.length > 0 ? [{ registrationData, subRecipients }] : [];
                      
                      const recipientsToPrint = [...savedGroups, ...activeGroupPayload]
                        .map((group, i) => {
                            const validChildren = group.subRecipients.filter((sub: any) => sub.isEPPDGenerated !== false);
                            if (validChildren.length === 0) return null;

                            const subForBase = validChildren[0];
                            return {
                                ...group.registrationData,
                                ...subForBase,
                                tujuanPengajuan: group.registrationData.tujuanPengajuan || subForBase.tujuanPengajuan,
                                tujuanPenyaluranMPZIS: group.registrationData.tujuanPenyaluranMPZIS || subForBase.tujuanPenyaluranMPZIS,
                                budgetCode: group.registrationData.budgetCode || subForBase.budgetCode,
                                budgetName: group.registrationData.budgetName || subForBase.budgetName,
                                transactionType: group.registrationData.transactionType || subForBase.transactionType,
                                id: subForBase.id || `${mockIdPrefix}-${i}`,
                                registrationId: group.registrationData.registrationId,
                                lampiranItems: validChildren.map((child: any) => ({
                                    ...group.registrationData,
                                    ...child,
                                    tujuanPengajuan: group.registrationData.tujuanPengajuan || child.tujuanPengajuan,
                                    tujuanPenyaluranMPZIS: group.registrationData.tujuanPenyaluranMPZIS || child.tujuanPenyaluranMPZIS,
                                    budgetCode: group.registrationData.budgetCode || child.budgetCode,
                                    budgetName: group.registrationData.budgetName || child.budgetName,
                                    transactionType: group.registrationData.transactionType || child.transactionType,
                                }))
                            };
                        })
                        .filter(Boolean);

                      if (recipientsToPrint.length === 0) {
                        alert("Tidak ada penerima yang dipilih untuk mencetak E-PPD.");
                        return;
                      }

                      onMassEPPD(recipientsToPrint as any[]);
                    }}
                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-sm px-6 py-2.5 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    Cetak E-PPD
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 5: SUB TABEL PENERIMA TERDAFTAR (LIST IN ACTIVE FORM - KONFIRMASI) */}
        {currentStep === 5 && (
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 pb-2 border-b border-slate-100/80 gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">
                    Konfirmasi Data Penerima ({subRecipients.length + savedGroups.reduce((acc, g) => acc + g.subRecipients.length, 0)} Orang)
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Daftar individu yang akan diajukan bantuan dalam kelompok/ID
                    pendaftaran ini.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                {(subRecipients.length + savedGroups.reduce((acc, g) => acc + g.subRecipients.length, 0)) > 0 && (
                  <div className="relative w-full sm:w-64">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="Cari Nama atau NIK..."
                      className="form-input-custom font-medium pl-9 text-sm"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-hidden border border-slate-200/60 rounded-xl">
              {(subRecipients.length + savedGroups.reduce((acc, g) => acc + g.subRecipients.length, 0)) === 0 ? (
                <div className="p-10 text-center space-y-2 bg-slate-50/50">
                  <p className="text-slate-400 font-bold text-sm">
                    Belum Ada Penerima dalam Sub-Tabel
                  </p>
                  <p className="text-slate-400 text-xs max-w-md mx-auto">
                    Silakan isi data penerima pada formulir **"Form Input Data
                    Penerima"** diatas, kemudian klik tombol **"Tambahkan
                    Penerima ke Sub Tabel"** untuk meregistrasikannya di
                    sub-tabel ini.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
                  <table className="w-full text-left border-collapse table-auto text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-black sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="px-3.5 py-3 text-center border-r border-slate-200 w-12 font-bold">
                          No
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          Nama Penerima
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          Mengajukan Bantuan Untuk
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          NIK
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          Nomor KK
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap text-right">
                          Jumlah Bantuan
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          Alamat
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          Kampung
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          Kecamatan
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap text-center">
                          Lihat Berkas
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap text-center">
                          Status Berkas
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap border-b-slate-250 text-center">
                          Opsi Form
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          No Rekening
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          Nama Bank
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          Pemilik Rekening
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          Nama Sekolah
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          Tingkat Sekolah
                        </th>
                        <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">
                          Kelas
                        </th>
                        <th className="px-3 py-3 text-center font-bold w-24">
                          Tindakan
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {[
                        { isSavedGroup: false, rData: registrationData, subs: subRecipients, sIdx: -1 },
                        ...savedGroups.map((g, i) => ({ isSavedGroup: true, rData: g.registrationData, subs: g.subRecipients, sIdx: i }))
                      ].map((cfg, cIdx) => (
                        <React.Fragment key={cIdx}>
                          {cfg.subs.filter((sub: any) => {
                            if (!searchQuery) return true;
                            const q = searchQuery.toLowerCase();
                            return (sub.name || "").toLowerCase().includes(q) || (sub.nik || "").includes(q);
                          }).map((sub: any, idx: number) => {
                            const currentIdx = cIdx === 0 
                              ? idx 
                              : subRecipients.length + savedGroups.slice(0, cIdx - 1).reduce((acc, g) => acc + g.subRecipients.length, 0) + idx;
                            return (
                              <tr
                                key={`${cIdx}-${idx}`}
                                className="hover:bg-slate-50/60 transition-colors text-black font-normal"
                              >
                                <td className="px-3.5 py-4 text-center border-r border-slate-200/40 text-xs font-mono">
                                  {currentIdx + 1}
                                </td>
                                <td className="px-3 py-4 border-r border-slate-200/40 font-bold text-black capitalize whitespace-nowrap">
                                  {(sub.name || "(Tanpa Nama)").toLowerCase()}
                                </td>
                                <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap">
                                  {sub.programName || cfg.rData.programName || "-"}
                                </td>
                                <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap">
                            {sub.nik}
                          </td>
                          <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap">
                            {sub.kk}
                          </td>
                          <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap text-right font-bold font-mono">
                            Rp
                            {Number(sub.amountProposed || 0).toLocaleString(
                              "id-ID",
                            )}
                          </td>
                          <td
                            className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap max-w-[200px] truncate"
                            title={sub.address}
                          >
                            {sub.address || "-"}
                          </td>
                          <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap">
                            {sub.kampung || "-"}
                          </td>
                          <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap">
                            {sub.district || "-"}
                          </td>
                          <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap text-center min-w-[160px]">
                            {sub.documents && sub.documents.length > 0 ? (
                              <button
                                type="button"
                                disabled={mergingIdx !== null}
                                onClick={async () => {
                                  setMergingIdx(idx);
                                  try {
                                    const { mergeRecipientUploadsOnly } =
                                      await import("../lib/pdfMerger");
                                    await mergeRecipientUploadsOnly(
                                      sub.id || "",
                                      sub.documents,
                                    );
                                  } catch (error: any) {
                                    alert(
                                      error.message ||
                                        "Gagal menggabungkan berkas persyaratan.",
                                    );
                                  } finally {
                                    setMergingIdx(null);
                                  }
                                }}
                                className="text-xs font-bold bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 cursor-pointer hover:scale-102 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all active:scale-95 duration-150 disabled:opacity-50"
                                title="Gabungkan dan lihat 15 slot berkas persyaratan"
                              >
                                {mergingIdx === idx ? (
                                  <>
                                    <svg
                                      className="animate-spin h-3.5 w-3.5 text-indigo-700"
                                      xmlns="http://www.w3.org/2000/svg"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                    >
                                      <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                      ></circle>
                                      <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                      ></path>
                                    </svg>
                                    Memroses...
                                  </>
                                ) : (
                                  <>
                                    <FileText className="w-3.5 h-3.5" />
                                    Lihat Berkas
                                  </>
                                )}
                              </button>
                            ) : (
                              <span className="text-slate-400 text-xs font-semibold">
                                -
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap text-center">
                            <div className="flex flex-col items-center justify-center gap-1">
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded-full text-[10px] font-extrabold font-sans",
                                  (sub.documentStatus || "Lengkap") ===
                                    "Lengkap"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                                    : "bg-rose-50 text-rose-700 border border-rose-200/60",
                                )}
                              >
                                {sub.documentStatus || "Lengkap"}
                              </span>
                              {(sub.documentStatus || "Lengkap") ===
                                "Tidak Lengkap" &&
                                sub.documentStatusNotes && (
                                  <p
                                    className="text-[9px] text-rose-600 font-bold max-w-[120px] truncate"
                                    title={sub.documentStatusNotes}
                                  >
                                    {sub.documentStatusNotes}
                                  </p>
                                )}
                            </div>
                          </td>
                          <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap text-center">
                            <div className="flex flex-wrap items-center justify-center gap-1 max-w-[200px] mx-auto">
                              <span
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-[8px] font-extrabold",
                                  sub.isReceiptGenerated !== false
                                    ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                                    : "bg-slate-100 text-slate-500",
                                )}
                                title="Tanda Terima"
                              >
                                Tanda Terima
                              </span>
                              <span
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-[8px] font-extrabold",
                                  sub.isSurveyGenerated !== false
                                    ? "bg-sky-50 text-sky-700 border border-sky-200/60"
                                    : "bg-slate-100 text-slate-500",
                                )}
                                title="Form Permohonan"
                              >
                                Permohonan
                              </span>
                              <span
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-[8px] font-extrabold",
                                  sub.isMPZISGenerated !== false
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                                    : "bg-slate-100 text-slate-500",
                                )}
                                title="MPZIS"
                              >
                                MPZIS
                              </span>
                              <span
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-[8px] font-extrabold",
                                  sub.isEPPDGenerated !== false
                                    ? "bg-indigo-50 text-indigo-700 border border-indigo-200/60"
                                    : "bg-slate-100 text-slate-500",
                                )}
                                title="E-PPD"
                              >
                                E-PPD
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-4 border-r border-slate-200/40 font-mono text-xs text-black whitespace-nowrap">
                            {sub.bankAccountNo || "-"}
                          </td>
                          <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap uppercase">
                            {sub.bankName || "-"}
                          </td>
                          <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap capitalize">
                            {sub.bankAccountHolder
                              ? (sub.bankAccountHolder || "").toLowerCase()
                              : "-"}
                          </td>
                          <td
                            className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap truncate max-w-[150px]"
                            title={sub.schoolName}
                          >
                            {sub.schoolName || "-"}
                          </td>
                          <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap uppercase">
                            {sub.schoolLevel || "-"}
                          </td>
                          <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap">
                            {sub.schoolClass || "-"}
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex items-center justify-center gap-1.5">
                              {!cfg.isSavedGroup ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleLoadEditRecipient(idx)}
                                    className="p-1 px-2 text-indigo-600 hover:text-indigo-800 hover:bg-slate-100 rounded border border-slate-150 shadow-xs transition-colors flex items-center gap-1 text-xs font-semibold cursor-pointer"
                                    title="Edit Data Penerima ini"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveRecipientFromSubTable(idx)
                                    }
                                    className="p-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded border border-rose-100 shadow-xs transition-colors cursor-pointer"
                                    title="Hapus Penerima ini"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <span className="text-xs text-slate-400 font-medium">Tersimpan</span>
                              )}
                            </div>
                          </td>
                        </tr>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* REKAPITULASI TOTAL BANTUAN & STATISTIK */}
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-4">
                <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-sm flex-shrink-0">
                  <User className="w-6 h-6 text-slate-600" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-slate-800">Statistik Penerima</h4>
                  <div className="text-xs text-slate-600 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    <span>Total: <strong>{[...subRecipients, ...savedGroups.flatMap(g => g.subRecipients)].length} Orang</strong></span>
                    <span>Laki-laki: <strong>{[...subRecipients, ...savedGroups.flatMap(g => g.subRecipients)].filter(r => r.gender === 'Laki-laki').length}</strong></span>
                    <span>Perempuan: <strong>{[...subRecipients, ...savedGroups.flatMap(g => g.subRecipients)].filter(r => r.gender === 'Perempuan').length}</strong></span>
                    <span>Kecamatan: <strong>{new Set([...subRecipients, ...savedGroups.flatMap(g => g.subRecipients)].map(r => r.district).filter(Boolean)).size} Wilayah</strong></span>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex flex-col justify-center">
                <h4 className="text-sm font-bold text-indigo-900 mb-1">Total Bantuan (Keseluruhan)</h4>
                <div className="text-2xl font-black text-indigo-700 font-mono">
                  Rp {new Intl.NumberFormat("id-ID").format(
                    [...subRecipients, ...savedGroups.flatMap(g => g.subRecipients)].reduce((acc, sub) => acc + (Number(sub.amountProposed) || 0), 0)
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* FORM NAVIGATION ACTION BAR (Moved to Card) */}
        <div className="bg-white border border-slate-200 shadow-sm p-4 sm:p-5 rounded-xl animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setCurrentStep(prev => prev - 1);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2"
                >
                  Kembali
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 sm:px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-150 rounded-xl transition-colors cursor-pointer w-full sm:w-auto"
              >
                Batalkan
              </button>
              
              {currentStep < 5 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="bg-indigo-600 text-white font-bold text-sm px-6 py-2.5 rounded-xl hover:bg-indigo-700 hover:shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
                >
                  Berikutnya <ChevronRight className="w-4 h-4 ml-1" />
                </button>
              ) : (
                <button
                  onClick={handleSaveAllData}
                  type="button"
                  disabled={isSavingAll}
                  className={cn(
                    "px-6 sm:px-8 py-2.5 bg-emerald-600 text-white rounded-xl font-black flex items-center justify-center gap-2 transition-all shadow-md w-full sm:w-auto",
                    isSavingAll
                      ? "opacity-75 cursor-not-allowed"
                      : "hover:bg-emerald-750 active:scale-95 cursor-pointer",
                  )}
                >
                  {isSavingAll ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span className="truncate max-w-[150px] sm:max-w-none">
                    {isSavingAll
                      ? "Menyimpan..."
                      : subRecipients.length > 0
                        ? `Simpan Registrasi`
                        : "Simpan"}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </form>

      {/* PREVIEW DOCUMENT MODAL */}
      {previewDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-55 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 px-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <h4 className="font-bold text-slate-800 text-sm">
                  Pratinjau Berkas: {previewDoc.name}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Modal Body */}
            <div className="p-6 bg-slate-100 flex items-center justify-center min-h-[300px] w-full">
              {previewDoc.url.startsWith("gdrive:") ? (
                previewLoading ? (
                  <div className="text-center p-8 space-y-3 bg-white rounded-2xl border border-slate-100 shadow-sm max-w-md w-full">
                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
                    <p className="font-bold text-slate-800 text-xs">
                      Mengunduh pindaian dari Google Drive...
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Proses pengambilan data biner secara aman.
                    </p>
                  </div>
                ) : gdriveBase64Data ? (
                  gdriveBase64Data.startsWith("data:image") ? (
                    <div className="flex flex-col items-center gap-4 w-full">
                      <img
                        src={gdriveBase64Data}
                        referrerPolicy="no-referrer"
                        className="max-h-[60vh] object-contain rounded-lg shadow-sm border border-slate-200 bg-white"
                        alt={previewDoc.name}
                      />
                      <a
                        href={`https://drive.google.com/file/d/${previewDoc.url.split(":")[1]}/view?usp=drivesdk`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition-colors"
                      >
                        <Eye className="w-4 h-4" /> Buka di Google Drive (Tab
                        Baru)
                      </a>
                    </div>
                  ) : gdriveBase64Data.startsWith("data:application/pdf") ? (
                    <div className="flex flex-col items-center gap-4 w-full">
                      <iframe
                        src={gdriveBase64Data}
                        title={previewDoc.name}
                        className="w-full h-[60vh] rounded-lg shadow-sm border border-slate-200 bg-white"
                      />
                      <a
                        href={`https://drive.google.com/file/d/${previewDoc.url.split(":")[1]}/view?usp=drivesdk`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition-colors"
                      >
                        <Eye className="w-4 h-4" /> Buka di Google Drive (Tab
                        Baru)
                      </a>
                    </div>
                  ) : (
                    <div className="text-center p-8 space-y-4 bg-white rounded-2xl border border-slate-100 shadow-sm max-w-md w-full">
                      <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full w-14 h-14 mx-auto flex items-center justify-center">
                        <FileText className="w-8 h-8" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 text-sm">
                          {previewDoc.name}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Berkas format non-media siap disimpan.
                        </p>
                      </div>
                      <div className="flex gap-2 justify-center">
                        <a
                          href={gdriveBase64Data}
                          download={previewDoc.name}
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-750 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5 rotate-180" />
                          Unduh Berkas
                        </a>
                        <a
                          href={`https://drive.google.com/file/d/${previewDoc.url.split(":")[1]}/view?usp=drivesdk`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition-colors"
                        >
                          <Eye className="w-4 h-4" /> Buka di Drive
                        </a>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="text-center p-8 space-y-4 bg-white rounded-2xl border border-slate-100 shadow-sm max-w-md w-full">
                    <div className="p-3 bg-rose-50 text-rose-600 rounded-full w-14 h-14 mx-auto flex items-center justify-center">
                      <X className="w-8 h-8" />
                    </div>
                    <p className="font-bold text-slate-800 text-xs">
                      Gagal mengunduh berkas pratinjau
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Pastikan akun Google Anda terhubung dan memiliki izin.
                    </p>
                    <a
                      href={`https://drive.google.com/file/d/${previewDoc.url.split(":")[1]}/view?usp=drivesdk`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition-colors justify-center w-full"
                    >
                      <Eye className="w-4 h-4" /> Buka Langsung di Google Drive
                      (Tab Baru)
                    </a>
                  </div>
                )
              ) : previewDoc.url.startsWith("data:image") ? (
                <img
                  src={previewDoc.url}
                  referrerPolicy="no-referrer"
                  className="max-h-[60vh] object-contain rounded-lg shadow-sm border border-slate-200 bg-white"
                  alt={previewDoc.name}
                />
              ) : previewDoc.url.startsWith("data:application/pdf") ? (
                <iframe
                  src={previewDoc.url}
                  title={previewDoc.name}
                  className="w-full h-[60vh] rounded-lg shadow-sm border border-slate-200 bg-white"
                />
              ) : (
                <div className="text-center p-8 space-y-4 bg-white rounded-2xl border border-slate-100 shadow-sm max-w-md w-full">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full w-14 h-14 mx-auto flex items-center justify-center">
                    <FileText className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">
                      {previewDoc.name}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Berkas format biner telah siap disimpan.
                    </p>
                  </div>
                  <a
                    href={previewDoc.url}
                    download={previewDoc.name}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-750 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 rotate-180 animate-pulse" />
                    Unduh Berkas
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
