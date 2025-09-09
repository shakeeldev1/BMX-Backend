import express from 'express';
import { getAllWithdrawRequests, updateWithdrawStatus, withdrawRequest } from '../Controller/WithdrawController.js';
import { isUserLoggedin } from '../Utils/Auth.js';
const Router = express.Router();

Router.post('/withdraw-request',isUserLoggedin,withdrawRequest);
Router.get('/get-all-requests',isUserLoggedin,getAllWithdrawRequests);
Router.put('/update-withdraw-status/:withdrawId',isUserLoggedin,updateWithdrawStatus);

export default Router;