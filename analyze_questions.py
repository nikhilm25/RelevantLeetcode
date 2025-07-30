import os
import pandas as pd
from collections import defaultdict
import json

# --- Configuration: Input CSV Column Names ---
INPUT_DIFFICULTY_COLUMN = 'Difficulty'
INPUT_QUESTION_COLUMN = 'Title'
INPUT_LINK_COLUMN = 'Link'
INPUT_TOPICS_COLUMN = 'Topics'
INPUT_FREQUENCY_COLUMN = 'Frequency'
# --- End of Configuration ---

# --- Configuration: Output JSON Keys ---
OUTPUT_DIFFICULTY_COLUMN = 'Difficulty'
OUTPUT_QUESTION_COLUMN = 'Question'
OUTPUT_LINK_COLUMN = 'Link of Question'
OUTPUT_TOPICS_COLUMN = 'Topics'
OUTPUT_COMPANIES_COLUMN = 'Companies'
# --- End of Configuration ---

def get_company_directories(base_path="."):
    """Gets a list of all company directories in the given path."""
    directories = []
    script_dir = os.path.dirname(os.path.abspath(__file__))
    search_path = os.path.join(script_dir, base_path) if base_path == "." else base_path
    
    try:
        for item in os.listdir(search_path):
            item_path = os.path.join(search_path, item)
            if os.path.isdir(item_path) and not item.startswith('.'):
                if item.lower() not in ['__pycache__', '.git', '.github', '.vscode']:
                    directories.append(item)
    except FileNotFoundError:
        print(f"Directory not found: {search_path}")
    except PermissionError:
        print(f"Permission denied accessing: {search_path}")
    
    return directories

def get_csv_type_mapping():
    """Returns mapping of CSV files to frequency categories."""
    return {
        "1. Thirty Days.csv": "Freq30Days",
        "2. Three Months.csv": "Freq3Months", 
        "3. Six Months.csv": "Freq6Months",
        "4. More Than Six Months.csv": "FreqMoreThan6Months",
        "5. All.csv": "FreqAll"
    }

def safe_read_csv(file_path):
    """Safely read a CSV file with error handling."""
    try:
        return pd.read_csv(file_path)
    except FileNotFoundError:
        print(f"Warning: File not found: {file_path}")
        return None
    except pd.errors.EmptyDataError:
        print(f"Warning: Empty file: {file_path}")
        return None
    except Exception as e:
        print(f"Warning: Error reading {file_path}: {str(e)}")
        return None

def aggregate_all_questions(companies):
    """Aggregate all questions across all companies and time periods."""
    # Structure: question_title -> {basic_info, companies: {company_name -> {FreqAll, FreqMoreThan6Months, etc.}}}
    question_data = defaultdict(lambda: {
        'difficulty': '',
        'link': '',
        'topics': set(),
        'companies': defaultdict(lambda: {
            'FreqAll': 0,
            'FreqMoreThan6Months': 0,
            'Freq6Months': 0,
            'Freq3Months': 0,
            'Freq30Days': 0
        })
    })
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    csv_mapping = get_csv_type_mapping()
    
    print("Processing all companies and time periods...")
    
    for company in companies:
        print(f"\nProcessing company: {company}")
        
        for csv_file, freq_key in csv_mapping.items():
            file_path = os.path.join(script_dir, company, csv_file)
            
            if not os.path.exists(file_path):
                print(f"  {csv_file}: File not found")
                continue
                
            df = safe_read_csv(file_path)
            if df is None or df.empty:
                print(f"  {csv_file}: No data")
                continue
                
            print(f"  {csv_file}: {len(df)} questions")
            
            for _, row in df.iterrows():
                try:
                    question_title = str(row.get(INPUT_QUESTION_COLUMN, '')).strip()
                    difficulty = str(row.get(INPUT_DIFFICULTY_COLUMN, '')).strip()
                    link = str(row.get(INPUT_LINK_COLUMN, '')).strip()
                    topics = str(row.get(INPUT_TOPICS_COLUMN, '')).strip()
                    
                    # Get frequency from CSV
                    frequency = 1  # default value
                    if INPUT_FREQUENCY_COLUMN in row and pd.notna(row[INPUT_FREQUENCY_COLUMN]):
                        try:
                            frequency = float(row[INPUT_FREQUENCY_COLUMN])
                            if frequency <= 0:
                                frequency = 1
                        except (ValueError, TypeError):
                            frequency = 1
                    
                    if not question_title:
                        continue
                    
                    # Update basic question info (only if not already set or if current is better)
                    if difficulty and not question_data[question_title]['difficulty']:
                        question_data[question_title]['difficulty'] = difficulty
                    if link and not question_data[question_title]['link']:
                        question_data[question_title]['link'] = link
                    if topics:
                        topic_list = [t.strip() for t in topics.split(',') if t.strip()]
                        question_data[question_title]['topics'].update(topic_list)
                    
                    # Update company frequency data
                    question_data[question_title]['companies'][company][freq_key] = int(frequency)
                    
                except Exception as e:
                    print(f"    Error processing row in {company}/{csv_file}: {str(e)}")
                    continue
    
    return question_data

def create_unified_output_data(question_data):
    """Convert question data to unified output format."""
    output_data = []
    
    for question_title, data in question_data.items():
        # Convert topics set to sorted string
        topics_list = sorted(list(data['topics']))
        topics_string = ', '.join(topics_list)
        
        # Create companies array
        companies_array = []
        for company_name, freq_data in data['companies'].items():
            company_record = {
                'Name': company_name,
                'FreqAll': freq_data['FreqAll'],
                'FreqMoreThan6Months': freq_data['FreqMoreThan6Months'],
                'Freq6Months': freq_data['Freq6Months'],
                'Freq3Months': freq_data['Freq3Months'],
                'Freq30Days': freq_data['Freq30Days']
            }
            companies_array.append(company_record)
        
        # Sort companies by FreqAll (descending) then by name
        companies_array.sort(key=lambda x: (-x['FreqAll'], x['Name']))
        
        question_record = {
            OUTPUT_DIFFICULTY_COLUMN: data['difficulty'],
            OUTPUT_QUESTION_COLUMN: question_title,
            OUTPUT_LINK_COLUMN: data['link'],
            OUTPUT_TOPICS_COLUMN: topics_string,
            OUTPUT_COMPANIES_COLUMN: companies_array
        }
        
        output_data.append(question_record)
    
    # Sort by total companies asking (descending) then by question title
    output_data.sort(key=lambda x: (-len(x[OUTPUT_COMPANIES_COLUMN]), x[OUTPUT_QUESTION_COLUMN]))
    
    return output_data

def save_json_file(data, filename):
    """Save data as JSON file."""
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"✓ JSON file saved: {filename}")
    except Exception as e:
        print(f"✗ Error saving JSON file {filename}: {str(e)}")

def main():
    """Main function to process all CSV files and generate unified output."""
    print("=== LeetCode Questions Unified Aggregator ===")
    print("Processing all companies and time periods...")
    
    # Get script directory for context
    script_dir = os.path.dirname(os.path.abspath(__file__))
    print(f"Working directory: {script_dir}")
    
    # Get all company directories
    companies = get_company_directories(".")
    if not companies:
        print("No company directories found in the current directory!")
        print("Please ensure company folders are in the same directory as this script.")
        return
        
    print(f"Found {len(companies)} companies: {', '.join(companies)}")
    
    # Aggregate all questions across companies and time periods
    question_data = aggregate_all_questions(companies)
    
    if not question_data:
        print("No data found!")
        return
    
    # Create unified output data
    output_data = create_unified_output_data(question_data)
    
    # Save unified JSON file
    filename = os.path.join(script_dir, "questions_data_unified.json")
    save_json_file(output_data, filename)
    
    # Print summary
    print(f"\n{'='*60}")
    print("Processing complete!")
    print(f"{'='*60}")
    print(f"Total unique questions: {len(output_data)}")
    print(f"Total companies processed: {len(companies)}")
    
    if output_data:
        # Find question with most companies
        max_companies = max(len(q[OUTPUT_COMPANIES_COLUMN]) for q in output_data)
        top_questions = [q for q in output_data if len(q[OUTPUT_COMPANIES_COLUMN]) == max_companies]
        
        print(f"Most popular question(s) ({max_companies} companies):")
        for q in top_questions[:3]:  # Show top 3
            print(f"  - {q[OUTPUT_QUESTION_COLUMN]}")

if __name__ == "__main__":
    main()