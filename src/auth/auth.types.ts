export type JwtPayload = {
  sub: string;
  email: string;
  isAdmin: boolean;
};

export type RequestUser = {
  userId: string;
  email: string;
  isAdmin: boolean;
};
