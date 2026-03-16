1. Polling — I called poll_tasks("ap_permitfriction_com") which returned a    
  pending findLeads task with criteria: role="Data center developer",
  industry="Data center", companyType="PE fund", count=1.                       
                                                                              
  2. Browser setup — I launched Playwright's Chromium with a persistent profile 
  at ~/.pfi-browser-profile. You had to log into LinkedIn manually the first
  time (session is now saved for future runs).                                  
                                                                              
  3. LinkedIn search — I navigated to:                                          
  linkedin.com/search/results/people/?keywords=Data%20center%20developer%20PE%20
  fund                                                                          
  Then waited 5 seconds for results to load.                                  
                                                                                
  4. Scraping — I used document.querySelectorAll('[role="listitem"]') to find   
  result cards, then extracted the name, title, and profile URL from each. Got  
  10 results back.                                                              
                                                                                
  5. Saved 1 lead — Since count=1, I took the top result and called save_leads  
  with:
  { "name": "Jess Pettit, PE",                                                  
    "company": "Specializing in data center design and development",            
    "linkedin": "https://www.linkedin.com/in/jesspettit/" }                     
  The MCP server wrote this to users/ap_permitfriction_com/leads/{auto-id} in   
  Firestore.                                                                    
                                                                                
  6. Completed task — Called complete_task("ap_permitfriction_com", "findLeads")
   which set the task status to "complete" in Firestore, triggering the         
  dashboard to update.                                            
                                                                                
  7. Resumed polling — Went back to calling poll_tasks every 10 seconds waiting 
  for the next task.