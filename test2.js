const DEFAULT_REGISTRATION_DATA = { tujuanPengajuan: "Tujuan pengajuan tes" };
const registrationData = { ...DEFAULT_REGISTRATION_DATA };
const groupSettings = registrationData;
const r = { tujuanPengajuan: "" };
const finalRecipients = [ r ];
const mappedCurrentGroup = finalRecipients.map((r) => {
  return { ...r, ...groupSettings };
});
console.log(mappedCurrentGroup);
