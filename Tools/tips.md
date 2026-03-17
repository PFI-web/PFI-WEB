⏺ How comms-mcp Works (Simply)                                                  
                                                                              
  The Big Idea                                                                  
   
  You have 1 brain agent and multiple worker agents — all Claude instances —    
  coordinating through a shared server to find infrastructure projects in Texas
  (data centers, manufacturing plants, power grid projects).                    
                                                                             
  Think of it like a research team: one manager (brain) assigns work, and       
  several researchers (workers) go dig up information and report back.
                                                                                
  ---                                                                           
  The Three Layers
                                                                                
  1. Event Bus (in-memory) — The walkie-talkie system. Agents talk to each other
   in real-time through structured messages. Sub-millisecond delivery because   
  everything runs in one process.                                            
                                                                                
  2. SQLite Database — The whiteboard. Temporary session state: who's           
  registered, what tasks exist, what's been found so far. Gets wiped between
  sessions — that's fine.                                                       
                  
  3. Firestore + Google Sheets — The filing cabinet. Findings get permanently   
  saved to Firestore (so they survive across sessions) and written to a Google
  Sheet (so humans can read them).                                              
                  
  ---
  How a Session Runs
                                                                                
  Brain starts up:
                                                                                
  1. Calls set_engagement() — this also loads all past findings from Firestore  
  into SQLite
  2. Registers itself as the brain                                              
  3. Gets the full picture of current state                                     
  4. Starts directing workers immediately (the PFI research goal is baked in)
  5. Enters a loop: wait for events → process them → repeat                     
                                                                                
  Workers start up:                                                             
                                                                                
  1. Call set_engagement() and register                                         
  2. Block and wait for the brain's first directive (zero tokens burned while
  waiting)                                                                      
  3. Receive a directive like "go search ERCOT for data center permits"
  4. Submit a plan back to brain for approval                                   
  5. Brain approves/rejects/modifies the plan                                   
  6. Worker executes: claims tasks, visits websites (via Playwright browser),   
  extracts data, registers findings                                             
                                                                                
  ---                                                                           
  Communication Flow
                                                                                
  Worker finds something → register_finding() → saved to SQLite + Firestore +
  Sheets                                                                        
                                                → event broadcast to all agents
                                                                                
  Brain sees the event → decides next steps → issue_directive() to a specific   
  worker                                                                        
                                                                                
  Worker gets stuck → ask_brain() → brain responds via respond_to_worker()      
  
  There's a clever piggyback system: every time a worker calls any tool, pending
   messages are automatically appended to the response. So workers get their
  "mail" for free without polling.                                              
                  
  ---
  The Smart Parts
                                                                                
  - Auto-correlation: When a worker registers a finding, the system
  automatically checks if another worker has a related task and alerts the      
  brain. Same for dead ends.
  - Dead ends: If a worker discovers a source is blocked/useless, it registers a
   dead end. Before any worker tries a technique, they check dead ends first —  
  no wasted effort.
  - Deduplication: Findings have dedup keys. The system prevents the same       
  project from being registered twice, both in SQLite and Firestore             
  (deterministic doc IDs).
  - Source logging: Workers track every source they visit — accessible ones and 
  blocked ones — so the team builds a map of what works and what needs human    
  follow-up.
                                                                                
  ---                                                                           
  What Workers Actually Produce
                                                                                
  For each infrastructure project found, they extract 6 fields:
  - Project Name, Type (data center / manufacturing / grid), County, Size,      
  Current Stage, Dates                                                          
                                                                                
  These get parsed automatically and written as structured rows to the Google   
  Sheet and Firestore docs.                                                     
  
  ---                                                                           
  TL;DR           
                                                                                
  Brain coordinates, workers research, the event bus keeps everyone in sync,
  SQLite is the scratch pad, Firestore is the permanent record, and Google      
  Sheets is the human-readable output. The whole thing runs as one HTTP server
  so all agents share the same memory space.                                    
                  
