import UserModel from '../models/user.model.js';
import bcryptjs from 'bcryptjs';
import sendEmail from '../config/sendEmail.js';
import verifyEmailTemplate from '../utils/verifyEmailTemplate.js';
import generatedAccessToken from '../utils/generatedAccessToken.js';
import generatedRefreshToken from '../utils/generatedRefreshToken.js';
import uploadImageClodinary from '../utils/uploadImageClodinary.js';
import generatedOtp from '../utils/generatedOtp.js';
import forgotPasswordTemplate from '../utils/forgotPasswordTemplate.js';
import jwt from 'jsonwebtoken'
// import { Await } from 'react-router-dom


export async function registerUserController(req,res){
    try{
        const { name, email, password } = req.body;

        if(!name || !email || !password){
            return res.status(400).json({
                message : "provide email, name, password",
                error : true,
                success : false
            })
        }

        const user = await UserModel.findOne({ email })

        if(user){
            return res.json({
                message : "Already register email",
                error : false,
                success : true
            })
        }

        const salt = await bcryptjs.genSalt(10)
        const hashPassword = await bcryptjs.hash(password,salt)

        const payload = {
            name,
            email,
            password : hashPassword
        }

        const newUser = new UserModel(payload)
        const save = await newUser.save()

        const VerifyEmailUrl = `${process.env.FRONTEND_URL}/verify-email?code=${save?._id}`

        const verifyEmail = await sendEmail({
            sendTo : email,
            subject : "verify email from blinkit",
            html : verifyEmailTemplate({
                name,
                url : VerifyEmailUrl
            })
        })

        return res.json({
            message : "User register successfully",
            error : false,
            success : true,
            data : save
        })

    } catch (error){
        return res.status(500).json ({
            message : error.message || error,
            error : true,
            success : false
        })
    }
}

export async function verifyEmailController(req, res){
    try {
        const { code } = req.body

        const user = await UserModel.findOne({ _id : code})

        if(user){
            return res.status(400).json({
                message : "Invalid code",
                error : true,
                success :false
            })
        }

        const updateUser = await UserModel.updateOne({ _id : code },{
            verify_email : true
        })

        return res.json({
            message : "Verify email done",
            error : false,
            success : true
        })

    } catch (error){
        return res.status(500).json({
            message : error.message || error,
            error: true,
            success: true
        })
    }
}

//login controller
export async function loginController(req,res){
    try{
        const { email, password } = req.body


        if(!email || !password){
            return res.status(400).json({
                message : "Provide email, password",
                error : true,
                success: false
            })
        }
        const user = await UserModel.findOne({ email })

        if(!user){
            return res.status(400).json({
                message: "User not register",
                error: true,
                success: false
            })
        }

        if(user.status !== "Active"){
            return res(400).json({
                message : "Contact to Admin",
                error: true,
                success: false
            })
        }

        const checkPassword = await bcryptjs.compare(password, user.password)

        if(!checkPassword){
            return res.status(400).json({
                message: "Check your password",
                error: true,
                success: false
            })
        }

        const accessToken = await generatedAccessToken(user._id)
        const refreshToken = await generatedRefreshToken(user._id)

        const updateUser = await UserModel.findByIdAndUpdate(user?._id,{
            last_login_date : new Date()
        })

        const cookiesOption = {
            httpOnly : true,
            secure : true,
            sameSite : "None"
        }

        res.cookie('accessToken', accessToken, cookiesOption )
        res.cookie('refreshToken', refreshToken, cookiesOption )

        return res.json({
            message : "Login successfully",
            error : false,
            success : true,
            data : {
                accessToken,
                refreshToken
            }
        })


    } catch (error) {
        return res.status(500).json({
            message : error.message || error,
            error : true,
            success : false
        })
    }
}

//logout controller
export async function logoutController(req,res){
    try {
        const userid = req.userId  // middleware

        const cookiesOption ={
            httpOnly : true,
            secure : true,
            sameSite : "None"
        }
        res.clearCookie("accessToken", cookiesOption )
        res.clearCookie("refreshToken",  cookiesOption )

        const removeRefreshToken = await UserModel.findByIdAndUpdate(userid, {
            refresh_token : ""
        })

        return res.json({
            message : "Logout Successfully",
            error : false,
            success : true
        })

    } catch (error){
        return res.status(500).json({
            message: error.message || error,
            error : true,
            success : false
        })
    }
}

//upload user avatar
export async function uploadAvatar(req, res){
    try {
        const userId = req.userId //auth middleware
        const image = req.file //multer middleware

        const upload = await uploadImageClodinary(image)

        const updateUser = await UserModel.findByIdAndUpdate(userId,{
            avatar : upload.url
        })

        return res.json({
            message : "upload profile",
            error : false,
            success : true,
            data : {
                _id : userId,
                avatar : upload.url
            }
        })

    } catch (error){
        return res.status(500).json({
            message : error.message || error,
            error : true,
            success : false
        })
    }
}

//update user details
export async function updateUserDetails(req,res){
    try {
        const userId = req.userId //auth middleware
        const { name, email, mobile, password } = req.body 

        let hashPassword = ""

        if(password){
            const salt = await bcryptjs.genSalt(10)
            hashPassword = await bcryptjs.hash(password,salt)
        }

        const updateUser = await UserModel.updateOne({ _id : userId},{
            ...(name && { name : name }),
            ...(email && { email : email }),
            ...(mobile && { mobile : mobile }),
            ...(password && { password : hashPassword })
        })

        return res.json({
            message : "Updated successfully",
            error : false,
            success : true,
            data : updateUser
        })


    } catch (error) {
        return res.status(500).json({
            message : error.message || error,
            error : true,
            success : false
        })
    }
}

// forgot password not login
export async function forgotPasswordController(req, res) {
    try {
        const { email } = req.body

        const user = await UserModel.findOne({ email })

        if(!user){
            return res.status(400).json({
                message : "Email is not available",
                error : true,
                success : true
            })
        }

        const otp = generatedOtp()
        const expireTime = new Date() + 60 * 60 * 1000  //1hr

        const update = await UserModel.findByIdAndUpdate(user._id,{
            forgot_password_otp : otp,
            forgot_password_expiry : new Date(expireTime).toISOString()
        })

        await sendEmail({
            sendTo : email,
            subject : "Forgot password from blinkit",
            html : forgotPasswordTemplate({
                name : user.name,
                otp : otp
            })
        })

        return res.json({
            message : "check your email",
            error : false,
            success : true
        })

    } catch (error) {
        return res.status(500).json({
            message : error.message || error,
            error : true,
            success : false
        })
    }
}

// verify forgot password otp 
export async function verifyForgotPasswordOtp(request,response){
    try {
        const { email , otp }  = request.body

        if(!email || !otp){
            return response.status(400).json({
                message : "Provide required field email, otp.",
                error : true,
                success : false
            })
        }

        const user = await UserModel.findOne({ email })

        if(!user){
            return response.status(400).json({
                message : "Email not available",
                error : true,
                success : false
            })
        }

        const currentTime = new Date().toISOString()

        if(user.forgot_password_expiry < currentTime  ){
            return response.status(400).json({
                message : "Otp is expired",
                error : true,
                success : false
            })
        }

        if(otp !== user.forgot_password_otp){
            return response.status(400).json({
                message : "Invalid otp",
                error : true,
                success : false
            })
        }

        //if otp is not expired
        //otp === user.forgot_password_otp

        const updateUser = await UserModel.findByIdAndUpdate(user?._id,{
            forgot_password_otp : "",
            forgot_password_expiry : ""
        })
        
        return response.json({
            message : "Verify otp successfully",
            error : false,
            success : true
        })

    } catch (error) {
        return response.status(500).json({
            message : error.message || error,
            error : true,
            success : false
        })
    }
}


//reset the password
export async function resetpassword(req, res){
    try {
        const { email, newPassword, confirmPassword } = req.body

        if(!email || !newPassword || !confirmPassword){
            return res.status(400).json({
                message : "provide required fields email, mewPassword, confirmPassword"
            })
        }

        const user = await UserModel.findOne({ email })

        if(!user){
            return res.status(400).json({
                message : "Email is not available",
                error : true,
                success : false
            })
        }

        if(newPassword !== confirmPassword){
            return res.status(400).json({
                message : "newPassword and confirmPassword not same,",
                error : true,
                success : false
            })
        }
        const salt = await bcryptjs.genSalt(10)
        const hashPassword = await bcryptjs.hash(newPassword,salt)

        const update = await UserModel.findByIdAndUpdate(user._id,{
            password : hashPassword
        })

        return res.json({
            message : "Password updated successfully.",
            error : false,
            success : true
        })
    } catch (error){
        return res.status(500).json({
            message : error.message || error,
            error : true,
            success : false
        })
    }
}

// refresh token controller
export async function refreshToken(req, res) {
    try {
        const refreshToken = req.cookies.refreshToken || req?.headers?.authorization?.split(" ")[1]; 

    if (!refreshToken) {
        return res.status(401).json({
            message: "Invalid token",
            error: true,
            success: false
        });
    }

    const verifyToken = jwt.verify(refreshToken, process.env.SECRET_KEY_REFRESH_TOKEN);

    if (!verifyToken) {
        return res.status(401).json({
            message: "Token is expired",
            error: true,
            success: false
        });
    }

    const userId = verifyToken?.id || verifyToken?._id; 

    const newAccessToken = await generatedAccessToken(userId);

    const cookiesOption = {
        httpOnly: true,
        secure: true,
        sameSite: "None"
    };


    res.cookie('accessToken', newAccessToken, cookiesOption);

    return res.json({
        message: "New Access token generated",
        error: false,
        success: true,
        data: {
        accessToken: newAccessToken
        }
    });

    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

//get login user details
export async function userDetails(request,response){
    try {
        const userId  = request.userId

        console.log(userId)

        const user = await UserModel.findById(userId).select('-password -refresh_token')

        return response.json({
            message : 'user details',
            data : user,
            error : false,
            success : true
        })
    } catch (error) {
        return response.status(500).json({
            message : "Something is wrong",
            error : true,
            success : false
        })
    }
}