const generatePolicy = function (effect: any, resource: any) {
  const authResponse = {
    principalId: 'telegram',
    policyDocument: null,
  };

  if (effect && resource) {
    const policyDocument: any = {};
    policyDocument.Version = '2012-10-17';
    policyDocument.Statement = [];
    const statementOne: any = {};
    statementOne.Action = 'execute-api:Invoke';
    statementOne.Effect = effect;
    statementOne.Resource = resource;
    policyDocument.Statement[0] = statementOne;
    authResponse.policyDocument = policyDocument;
  }

  return authResponse;
};

export const handler = async (
  event: any = {},
  context: any,
  cb: any,
): Promise<any> => {
  if (
    event.headers['X-Telegram-Bot-Api-Secret-Token'] ===
    process.env.SECRET_TOKEN
  ) {
    return cb(null, generatePolicy('Allow', event.methodArn));
  }
  return cb('Unauthorized');
};
