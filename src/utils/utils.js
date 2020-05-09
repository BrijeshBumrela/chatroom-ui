// Function to update the current user lists when new lists arrive from socket
const updateUserInfo = (currUsers, userIds) => {
  const updated = [];
  const idList = currUsers.map(user => user.id);
  for (let userid of userIds) {
    if (!idList.includes(userid)) {
      updated.push({ id: userid, consuming: false });
    }
  }
  for (let user of currUsers) {
    if (userIds.includes(user.id)) {
      updated.push(user);
    }
  }
  return updated;
};

export { updateUserInfo };
