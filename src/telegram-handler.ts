export const handler = async (event: any = {}): Promise<any> => {
  console.log(JSON.stringify(event));
  return { statusCode: 204, body: JSON.stringify(event) };
};
