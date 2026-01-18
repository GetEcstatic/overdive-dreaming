yebo next "To use overdive.app with Vercel:  
  
1. **In Vercel Dashboard:**  
- Go to your project → Settings → Domains  
- Click 'Add Domain' → Enter overdive.app  
- Vercel will show DNS records you need to add  
  
2. **At Your Domain Registrar:**  
- Add an A record: @ → 76.76.21.21  
- Add a CNAME record: www → cname.vercel-dns.com  
- (Or use Vercel nameservers for full control)  
  
3. **Wait for DNS propagation** (usually 5-60 minutes)  
  
4. **SSL:** Vercel auto-provisions HTTPS certificate once DNS is verified  
  
**Optional:** If you want www.overdive.app to redirect to overdive.app (or vice versa), configure that in Vercel's domain settings.  
  
That's it! Vercel handles everything else automatically."