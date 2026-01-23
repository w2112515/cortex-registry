import React from 'react';

interface SearchBarProps {
    onSearch: (query: string) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch }) => {
    return (
        <div className="relative group mb-6">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none opacity-50 group-focus-within:opacity-100 group-focus-within:text-neon-cyan transition-colors">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>
            <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-grid-line bg-transparent text-gray-100 placeholder-gray-500 focus:outline-none focus:border-neon-cyan focus:ring-1 focus:ring-neon-cyan sm:text-sm rounded-md transition-all duration-300 backdrop-blur-sm font-mono tracking-wide"
                placeholder="SEARCH_PROTOCOL //"
                onChange={(e) => onSearch(e.target.value)}
            />
            {/* Decorative Corner */}
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-neon-cyan opacity-0 group-focus-within:opacity-100 transition-opacity" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-neon-cyan opacity-0 group-focus-within:opacity-100 transition-opacity" />
        </div>
    );
};

export default SearchBar;
