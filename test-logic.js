const term = "NM-123456";
const cleanTermNoPrefix = term.replace(/^NM-/, '');
console.log(cleanTermNoPrefix); // 123456

const data = { uid: "1234567890", friendCode: "NM-123456" };
const uidUpper = data.uid.toUpperCase();
const generatedCode = `NM-${uidUpper.slice(0, 6)}`;
const userFriendCode = (data.friendCode || '').toUpperCase().replace(/^[#@]/, '');

const matchCode = userFriendCode.includes(term) || userFriendCode.includes(cleanTermNoPrefix);
const matchGeneratedCode = generatedCode.includes(term) || generatedCode.includes(cleanTermNoPrefix);

console.log("matchCode", matchCode);
console.log("matchGen", matchGeneratedCode);
