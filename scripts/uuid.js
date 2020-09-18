export default function genUuid() {
  const tohex2 = (i) => (i<16?'0':'') + (i).toString(16);
  const B = (d, i) => ((d >> (8*i)) & 0xff);
  const H = (d, i) => tohex2(B(d, i));

  const d0 = Math.random() * 0xffffffff|0;
  const d1 = Math.random() * 0xffffffff|0;
  const d2 = Math.random() * 0xffffffff|0;
  const d3 = Math.random() * 0xffffffff|0;

  const s1 = H(d0,0) + H(d0,1) + H(d0,2) + H(d0,3);
  const s2 = H(d1,0) + H(d1,1);
  const s51 = H(d2,2) + H(d2,3);
  const s52 = H(d3,0) + H(d3,1) + H(d3,2) + H(d3,3);
  const s3 = tohex2(B(d1,2)&0x0f|0x40) + H(d1,3);
  const s4 = tohex2(B(d2,0)&0x3f|0x80) + H(d2,1);

  return s1 + '-' + s2 + '-' + s3 + '-' + s4 + '-' + s51 + s52;
}

