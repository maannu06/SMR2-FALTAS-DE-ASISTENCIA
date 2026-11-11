import * as ResEdit from 'resedit';
import fs from 'fs';
const exePath = process.argv[2], icoPath = process.argv[3];
const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(exe);
const ico = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
const grupos = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const id = grupos.length ? grupos[0].id : 1, lang = grupos.length ? grupos[0].lang : 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map(i => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
if (vi) {
  vi.setStringValues({ lang: 1033, codepage: 1200 }, { FileDescription: 'Control de faltas SMR', ProductName: 'Control de faltas SMR', CompanyName: 'Alumnado 2.º SMR', OriginalFilename: 'Control de faltas SMR.exe', InternalName: 'Control de faltas SMR' });
  vi.setFileVersion(1, 0, 0, 0); vi.setProductVersion(1, 0, 0, 0);
  vi.outputToResourceEntries(res.entries);
}
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log('icono puesto en', exePath);
