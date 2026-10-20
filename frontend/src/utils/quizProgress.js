export const findFirstUnansweredIndex = (answersObj = {}, total = 0) => {
  for (let i = 0; i < total; i++) {
    if (answersObj[i] === undefined) return i;
  }
  return -1;
};

export const findLastCompletedQuestionLocal = (answersObj = {}, total = 0) => {
  for (let i = total - 1; i >= 0; i--) {
    if (answersObj[i] !== undefined) return i;
  }
  return -1;
};

export const countAnswered = (answersObj = {}) =>
  Object.keys(answersObj).filter(
    (key) => answersObj[key] !== undefined && answersObj[key] !== -1,
  ).length;

export const isAllAnswered = (answersObj = {}, total = 0) => {
  for (let i = 0; i < total; i++) {
    if (answersObj[i] === undefined || answersObj[i] === -1) return false;
  }
  return true;
};
