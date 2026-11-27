// Stable, server-earned collectibles; one diploma per subject.
export const SCHOOL_MEDALS=[
 ["chess-school-foundations","Chess Foundations Medal","Complete the Foundations module.",7],
 ["chess-school-rulebook","Chess Rules Scholar","Complete the Rules and Endings module.",12]
];
export const CHESS_DIPLOMA_ID="chess";
export const CHESS_DIPLOMA_RANKS=Object.freeze(["Associate’s","Bachelor’s","Master’s","PhD"]);
export const LEGACY_CHESS_DIPLOMA="chess-associates-diploma";
export const legacySchoolAward=id=>id===LEGACY_CHESS_DIPLOMA||SCHOOL_MEDALS.some(m=>m[0]===id);
export const validDiplomaRank=rank=>Number.isInteger(rank)&&rank>=1&&rank<=CHESS_DIPLOMA_RANKS.length;
export const diplomaTitle=rank=>validDiplomaRank(rank)?CHESS_DIPLOMA_RANKS[rank-1]+" in Chess Diploma":null;
export const shouldUpgradeDiploma=(current,target)=>validDiplomaRank(target)&&(!validDiplomaRank(current)||target>current);
