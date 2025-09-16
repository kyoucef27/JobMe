import { v2 as cloudinary } from "cloudinary";
cloudinary.config({
    cloud_name: "dztptq6q1",
    api_key: process.env.CLOUDINARY_KEY!,
    api_secret: process.env.CLOUDINARY_SECRET!,
});

export default cloudinary