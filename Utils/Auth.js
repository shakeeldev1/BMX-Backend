import Errorhandler from './ErrorHandler.js';
import UserModel from '../Model/UserModel.js';
import jwt from 'jsonwebtoken';

export const isUserLoggedin = async (req, res, next) => {
  try {
    let token;
    if (req.cookies?.token) {
      token = req.cookies.token;
    }
    else if (req.headers?.authorization && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }
    if (!token) {
      return next(new Errorhandler("Please login to access this page.", 401));
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await UserModel.findById(decoded.id);
    if (!user) {
      return next(new Errorhandler("User not found.", 404));
    }
    req.user = user;
    next();
  } catch (error) {
    return next(new Errorhandler("Invalid or expired token.", 401));
  }
};
