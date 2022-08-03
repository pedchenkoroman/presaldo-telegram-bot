export const handler = async (event: any = {}): Promise<any> => {
  console.log(JSON.stringify(event));
  console.log(JSON.stringify(event.body));
  return { statusCode: 204, body: JSON.stringify('so far so good') };
};
