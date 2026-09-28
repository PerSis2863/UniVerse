export const getCertificateHtml = (data: {
  studentName: string;
  certificateTitle: string;
  issuedAt: string;
  id: string;
}) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Certificate</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Montserrat:wght@300;400;600&display=swap');
        
        body {
            margin: 0;
            padding: 0;
            font-family: 'Montserrat', sans-serif;
            background-color: #f3f4f6;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
        }

        .certificate-container {
            width: 1000px;
            height: 700px;
            background: white;
            position: relative;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            overflow: hidden;
            border: 10px solid #111827;
            padding: 20px;
            box-sizing: border-box;
        }

        .certificate-border {
            position: absolute;
            top: 20px;
            left: 20px;
            right: 20px;
            bottom: 20px;
            border: 2px solid #e5e7eb;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 40px;
            box-sizing: border-box;
            background: linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(249,250,251,1) 100%);
        }

        .watermark {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-family: 'Cinzel', serif;
            font-size: 120px;
            color: rgba(17, 24, 39, 0.03);
            white-space: nowrap;
            z-index: 1;
            pointer-events: none;
        }

        .content {
            position: relative;
            z-index: 10;
            text-align: center;
            width: 100%;
        }

        .logo {
            font-family: 'Cinzel', serif;
            font-size: 36px;
            font-weight: 700;
            color: #111827;
            margin-bottom: 40px;
            letter-spacing: 2px;
        }
        
        .logo span {
            color: #4f46e5;
        }

        .title {
            font-family: 'Cinzel', serif;
            font-size: 48px;
            color: #111827;
            margin: 0 0 20px 0;
            text-transform: uppercase;
            letter-spacing: 4px;
        }

        .subtitle {
            font-size: 16px;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 40px;
        }

        .presented-to {
            font-size: 14px;
            color: #9ca3af;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 10px;
        }

        .student-name {
            font-family: 'Cinzel', serif;
            font-size: 56px;
            color: #111827;
            margin: 0 0 40px 0;
            font-weight: 700;
            border-bottom: 2px solid #e5e7eb;
            display: inline-block;
            padding: 0 40px 10px 40px;
        }

        .description {
            font-size: 16px;
            color: #4b5563;
            line-height: 1.6;
            max-width: 600px;
            margin: 0 auto 50px auto;
        }

        .footer {
            display: flex;
            justify-content: space-between;
            width: 100%;
            margin-top: auto;
            padding: 0 40px;
            box-sizing: border-box;
        }

        .signature-block {
            text-align: center;
        }

        .signature-line {
            width: 200px;
            border-bottom: 1px solid #111827;
            margin-bottom: 10px;
        }
        
        .signature-text {
            font-family: 'Cinzel', serif;
            font-size: 24px;
            color: #111827;
            margin-bottom: -5px;
        }

        .signature-title {
            font-size: 12px;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .meta-info {
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 10px;
            color: #9ca3af;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="certificate-container">
        <div class="watermark">UNIVERSE</div>
        <div class="certificate-border">
            <div class="content">
                <div class="logo">UNI<span>VERSE</span></div>
                
                <h1 class="title">Certificate of Impact</h1>
                <div class="subtitle">Social Impact & Humanitarian Excellence</div>
                
                <div class="presented-to">This is proudly presented to</div>
                
                <h2 class="student-name">${data.studentName}</h2>
                
                <div class="description">
                    In recognition of achieving the distinguished <strong>${data.certificateTitle}</strong>. 
                    Your dedication, hard work, and commitment to driving positive social change 
                    within the global community serve as an inspiration to all.
                </div>
                
                <div class="footer">
                    <div class="signature-block">
                        <div class="signature-text">UniVerse Admin</div>
                        <div class="signature-line"></div>
                        <div class="signature-title">Authorized Signature</div>
                    </div>
                    
                    <div class="signature-block">
                        <div class="signature-text">${data.issuedAt}</div>
                        <div class="signature-line"></div>
                        <div class="signature-title">Date of Issue</div>
                    </div>
                </div>
            </div>
            
            <div class="meta-info">
                Certificate ID: ${data.id} <br>
                Verify authentic credentials at universe.edu/verify
            </div>
        </div>
    </div>
</body>
</html>
`;
